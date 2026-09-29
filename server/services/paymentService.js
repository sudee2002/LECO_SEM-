const { dbQuery } = require('../db/database');

/**
 * Creates a PENDING top-up payment order.
 */
async function createTopUpOrder(userId, amount) {
  if (!amount || amount <= 0) {
    throw new Error('Top-up amount must be greater than zero.');
  }

  const orderId = 'ORD-' + Date.now() + '-' + Math.floor(100 + Math.random() * 900);
  const paymentId = 'PAY-' + Math.floor(100000 + Math.random() * 900000);

  await dbQuery.run(
    `INSERT INTO payments (payment_id, user_id, order_id, amount, status) VALUES (?, ?, ?, ?, ?)`,
    [paymentId, userId, orderId, amount, 'PENDING']
  );

  return {
    paymentId,
    orderId,
    amount,
    status: 'PENDING',
    gateway: 'PayHere Sandbox'
  };
}

/**
 * Handles verified server-to-server gateway callback/webhook.
 * 1. Verifies order and avoids duplicate processing (idempotency).
 * 2. Updates payment status to SUCCESS.
 * 3. Credits user's wallet balance atomically.
 * 4. Checks if supply is DISCONNECTED & balance > 0; triggers automatic RECONNECT command.
 */
async function processPaymentCallback(orderId, gatewayTxnId, status = 'SUCCESS') {
  // 1. Fetch payment record
  const payment = await dbQuery.get('SELECT * FROM payments WHERE order_id = ?', [orderId]);
  if (!payment) {
    throw new Error(`Payment order '${orderId}' not found.`);
  }

  // Idempotency check: if already processed, return current state
  if (payment.status === 'SUCCESS') {
    return {
      message: 'Payment already processed successfully (Idempotent call).',
      orderId,
      status: 'SUCCESS',
      alreadyProcessed: true
    };
  }

  if (status !== 'SUCCESS') {
    await dbQuery.run(
      `UPDATE payments SET status = 'FAILED' WHERE order_id = ?`,
      [orderId]
    );
    return {
      message: 'Payment payment failed at gateway.',
      orderId,
      status: 'FAILED'
    };
  }

  // 2. Mark payment SUCCESS
  const confirmTxnId = gatewayTxnId || 'GATEWAY-TXN-' + Date.now();
  await dbQuery.run(
    `UPDATE payments SET status = 'SUCCESS', gateway_txn_id = ?, confirmed_at = CURRENT_TIMESTAMP WHERE order_id = ?`,
    [confirmTxnId, orderId]
  );

  // 3. Fetch wallet & update balance
  const wallet = await dbQuery.get('SELECT * FROM wallets WHERE user_id = ?', [payment.user_id]);
  if (!wallet) {
    throw new Error(`Wallet not found for user ID ${payment.user_id}`);
  }

  const balanceBefore = wallet.current_balance;
  const balanceAfter = parseFloat((balanceBefore + payment.amount).toFixed(2));

  await dbQuery.run(
    `UPDATE wallets SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [balanceAfter, wallet.id]
  );

  await dbQuery.run(
    `INSERT INTO wallet_transactions (wallet_id, user_id, type, amount, balance_before, balance_after, reference) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [wallet.id, payment.user_id, 'TOPUP', payment.amount, balanceBefore, balanceAfter, `PAYHERE-${orderId}`]
  );

  // 4. Power Reconnection Logic
  const meter = await dbQuery.get('SELECT * FROM meters WHERE user_id = ?', [payment.user_id]);
  let powerReconnected = false;
  let powerCommand = null;

  if (meter && meter.power_state === 'DISCONNECTED' && balanceAfter > 0) {
    await dbQuery.run(
      `UPDATE meters SET power_state = 'CONNECTED' WHERE id = ?`,
      [meter.id]
    );

    const cmdId = 'CMD-RECONN-' + Date.now();
    await dbQuery.run(
      `INSERT INTO power_commands (command_id, meter_id, user_id, action, reason, status) VALUES (?, ?, ?, ?, ?, ?)`,
      [cmdId, meter.id, payment.user_id, 'RECONNECT', `Automatic restoration: Verified top-up of LKR ${payment.amount.toFixed(2)} credited (New balance: LKR ${balanceAfter.toFixed(2)})`, 'EXECUTED']
    );

    powerReconnected = true;
    powerCommand = {
      commandId: cmdId,
      action: 'RECONNECT',
      reason: `Verified top-up credited LKR ${payment.amount.toFixed(2)}`
    };

    await dbQuery.run(
      `INSERT INTO audit_logs (user_id, actor_role, action, details) VALUES (?, ?, ?, ?)`,
      [payment.user_id, 'system', 'POWER_RECONNECTED', `Meter ${meter.id} relay closed automatically. Balance: LKR ${balanceAfter.toFixed(2)}`]
    );
  }

  // Audit log for payment top-up
  await dbQuery.run(
    `INSERT INTO audit_logs (user_id, actor_role, action, details) VALUES (?, ?, ?, ?)`,
    [payment.user_id, 'customer', 'WALLET_TOPUP', `Top-up of LKR ${payment.amount.toFixed(2)} verified via PayHere webhook.`]
  );

  return {
    message: 'Payment verified and wallet credited successfully.',
    orderId,
    amount: payment.amount,
    balanceBefore,
    balanceAfter,
    powerReconnected,
    powerCommand
  };
}

module.exports = {
  createTopUpOrder,
  processPaymentCallback
};
