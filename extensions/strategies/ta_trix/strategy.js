var z = require('zero-fill')
  , n = require('numbro')

module.exports = function container (get, set, clear) {
  return {
    name: 'ta_trix',
    description: 'TRIX - 1-day Rate-Of-Change (ROC) of a Triple Smooth EMA with rsi oversold',

    getOptions: function () {
      this.option('period', 'period length eg 10m', String, '5m')
      this.option('timeperiod', 'timeperiod for TRIX', Number, 30)
      this.option('overbought_rsi_periods', 'number of periods for overbought RSI', Number, 25)
      this.option('overbought_rsi', 'sold when RSI exceeds this value', Number, 70)
    },

    calculate: function (s) {
      if (s.options.overbought_rsi) {
        // sync RSI display with overbought RSI periods
        s.options.rsi_periods = s.options.overbought_rsi_periods
        get('lib.rsi')(s, 'overbought_rsi', s.options.overbought_rsi_periods)
        if (!s.in_preroll && s.period.overbought_rsi >= s.options.overbought_rsi && !s.overbought) {
          s.overbought = true

          if (s.options.mode === 'sim' && s.options.verbose) {
            console.log(('\noverbought at ' + s.period.overbought_rsi + ' RSI, preparing to sold\n').cyan)
          }
        }
      }
    },

    onPeriod: function (s, cb) {
      if (!s.in_preroll && typeof s.period.overbought_rsi === 'number') {
        if (s.overbought) {
          s.overbought = false
          s.signal = 'sell'
          return cb()
        }
      }

      get('lib.ta_trix')(s, s.options.timeperiod).then(function(signal) {
        s.period['trix'] = signal;

        if (s.period.trix && s.lookback[0] && s.lookback[0].trix) {
          s.period.trend_trix = s.period.trix >= 0 ? 'up' : 'down';
        }

        if (s.period.trend_trix == 'up') {
          if (s.trend !== 'up') {
            s.acted_on_trend = false
          }

          s.trend = 'up'
          s.signal = !s.acted_on_trend ? 'buy' : null
        } else if (s.period.trend_trix == 'down') {
          if (s.trend !== 'down') {
            s.acted_on_trend = false
          }

          s.trend = 'down'
          s.signal = !s.acted_on_trend ? 'sell' : null
        }

        cb()
      }).catch(function(error) {
        console.log(error)
        cb()
      })
    },

    onReport: function (s) {
      let cols = []

      if (typeof s.period.trix === 'number') {
        let color = s.period.trix > 0 ? 'green' : 'red';

        cols.push(z(8, n(s.period.trix).format('0.0000'), ' ')[color])
     }

      return cols
    }
  }
}
