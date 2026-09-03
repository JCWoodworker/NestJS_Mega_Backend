/**
 * Normalizes Schwab's `GET /trader/v1/accounts/{accountHash}/orders` response
 * into the shape documented for the frontend's `GET /orders/working`
 * (contract section 10b) and reused by the order-update poller (section 10d).
 */

export interface WorkingOrder {
  orderId: string;
  symbol: string;
  instruction: string;
  quantity: number;
  filledQuantity: number;
  orderType: string;
  status: string;
  price: number | null;
  stopPrice: number | null;
  enteredTime: string | null;
}

/** Schwab returns orders newest-first with one leg per instrument; this app
 * only ever places single-leg orders, so the first leg is authoritative. */
export function mapWorkingOrders(schwabOrders: any[]): WorkingOrder[] {
  if (!Array.isArray(schwabOrders)) return [];

  return schwabOrders.map((order) => {
    const leg = order.orderLegCollection?.[0] ?? {};

    return {
      orderId: String(order.orderId ?? ''),
      symbol: leg.instrument?.symbol ?? '',
      instruction: leg.instruction ?? '',
      quantity: order.quantity ?? leg.quantity ?? 0,
      filledQuantity: order.filledQuantity ?? 0,
      orderType: order.orderType ?? '',
      status: order.status ?? '',
      price: order.price ?? null,
      stopPrice: order.stopPrice ?? null,
      enteredTime: order.enteredTime ?? null,
    };
  });
}

export interface OrderUpdate {
  orderId: string;
  symbol: string;
  status: string;
  orderType: string | null;
  stopPrice: number | null;
  price: number | null;
  filledQuantity: number;
  averageFillPrice: number | null;
}

/** Quantity-weighted average across every execution leg Schwab has recorded
 * for this order so far (there can be several on a partial fill). Returns
 * `null` for anything that hasn't filled at all yet. */
function computeAverageFillPrice(order: any): number | null {
  const legs = (order.orderActivityCollection ?? []).flatMap(
    (activity: any) => activity.executionLegs ?? [],
  );
  if (!legs.length) return null;

  const totalQuantity = legs.reduce(
    (sum: number, leg: any) => sum + (leg.quantity ?? 0),
    0,
  );
  if (!totalQuantity) return null;

  const weightedSum = legs.reduce(
    (sum: number, leg: any) => sum + (leg.price ?? 0) * (leg.quantity ?? 0),
    0,
  );
  return weightedSum / totalQuantity;
}

/** Builds the frontend's `order-update` socket payload (section 10d) minus
 * `accountHash`/`asOf`, which the caller already knows/stamps. */
export function mapOrderUpdate(order: any): OrderUpdate {
  const leg = order.orderLegCollection?.[0] ?? {};

  return {
    orderId: String(order.orderId ?? ''),
    symbol: leg.instrument?.symbol ?? '',
    status: order.status ?? '',
    orderType: order.orderType ?? null,
    stopPrice: order.stopPrice ?? null,
    price: order.price ?? null,
    filledQuantity: order.filledQuantity ?? 0,
    averageFillPrice: computeAverageFillPrice(order),
  };
}

/** Cheap fingerprint of the fields that matter to the frontend, so the
 * order-update poller only broadcasts when one of them actually changed
 * instead of every poll tick. */
export function orderUpdateFingerprint(update: OrderUpdate): string {
  return [
    update.status,
    update.filledQuantity,
    update.stopPrice,
    update.price,
    update.averageFillPrice,
  ].join('|');
}
