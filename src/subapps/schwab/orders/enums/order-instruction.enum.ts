export enum OrderInstruction {
  BUY_TO_OPEN = 'BUY_TO_OPEN',
  SELL_TO_CLOSE = 'SELL_TO_CLOSE',
  SELL_TO_OPEN = 'SELL_TO_OPEN',
  BUY_TO_CLOSE = 'BUY_TO_CLOSE',
}

export enum OrderType {
  LIMIT = 'LIMIT',
  MARKET = 'MARKET',
  /** Broker-resting stop, triggers a MARKET order once `stopPrice` trades. */
  STOP = 'STOP',
  /** Broker-resting stop, triggers a LIMIT order at `price` once `stopPrice` trades. */
  STOP_LIMIT = 'STOP_LIMIT',
}
