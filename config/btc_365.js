var c = module.exports = {}

c.selector = 'gdax.BTC-EUR'
c.strategy = 'macd'
c.currency_capital = 100
c.overbought_rsi_periods = 14
c.buy_pct = 100
c.period = '2h'
c.down_trend_threshold = 3
c.order_type = 'maker'
c.stats = true