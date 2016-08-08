var n = require('numbro')
  , colors = require('colors')
  , parallel = require('run-parallel')
  , tb = require('timebucket')
  , o = require('object-get')

module.exports = function container (get, set, clear) {
  var c = get('config')
  return function tick_reducer (g, cb) {
    var tick = g.tick, sub_tick = g.sub_tick
    if (!tick.data.trades) return cb()
    var bucket = tb(tick.time).resize(tick.size)
    var d = tick.data.trades
    get('ticks').select({
      query: {
        app: get('app_name'),
        size: tick.size,
        time: {
          $lt: bucket.toMilliseconds()
        }
      },
      limit: c.rsi_query_limit,
      sort: {
        time: -1
      }
    }, function (err, lookback) {
      if (err) return done(err)
      withLookback(lookback)
    })
    function withLookback (lookback) {
      Object.keys(d).forEach(function (e) {
        Object.keys(d[e]).forEach(function (pair) {
          var de = d[e][pair]
          de['rsi'] || (de['rsi'] = {})
          var r = de['rsi']
          r.ansi = ''
          var close_lookback = lookback.filter(function (tick) {
            return !!o(tick, 'data.trades.' + e + '.' + pair)
          }).map(function (tick) {
            return o(tick, 'data.trades.' + e + '.' + pair + '.close')
          })
          if (close_lookback.length > c.rsi_periods) {
            close_lookback = close_lookback.slice(r.samples - c.rsi_periods)
          }
          r.samples = close_lookback.length
          var current_gain, current_loss
          var last_close = close_lookback[r.samples - 1]
          if (!last_close) {
            current_gain = current_loss = 0
          }
          else {
            current_gain = de.close > last_close ? n(de.close).subtract(last_close).value() : 0
            current_loss = de.close < last_close ? n(last_close).subtract(de.close).value() : 0
          }
          last_close = 0
          var gain_sum = close_lookback.reduce(function (prev, curr) {
            var gain = curr > last_close ? curr - last_close : 0
            last_close = curr
            return prev + gain
          }, 0)
          var avg_gain = r.samples ? n(gain_sum).divide(r.samples).value() : 0
          last_close = 0
          var loss_sum = close_lookback.reduce(function (prev, curr) {
            if (!last_close) {
              last_close = curr
              return 0
            }
            var loss = curr < last_close ? last_close - curr : 0
            last_close = curr
            return prev + loss
          }, 0)
          var avg_loss = r.samples ? n(loss_sum).divide(r.samples).value() : 0
          var avg_gain_2 = n(avg_gain).multiply(c.rsi_periods - 1).add(current_gain).divide(c.rsi_periods).value()
          var avg_loss_2 = n(avg_loss).multiply(c.rsi_periods - 1).add(current_loss).divide(c.rsi_periods).value()
          if (avg_loss_2 === 0) {
            r.value = avg_gain_2 ? 100 : 50
          }
          else {
            var relative_strength = n(avg_gain_2).divide(avg_loss_2).value()
            r.value = n(100).subtract(n(100).divide(n(1).add(relative_strength))).value()
          }
          //console.error(gain_sum, avg_gain, loss_sum, avg_loss, avg_gain_2, avg_loss_2, relative_strength)
          r.ansi = n(r.value).format('0')[r.value > 70 ? 'green' : r.value < 30 ? 'red' : 'white']
          r.samples++
        })
      })
      cb()
    }
  }
}