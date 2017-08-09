const BFX = require('bitfinex-api-node')
var _ = require('lodash')
  , minimist = require('minimist')
  , path = require('path')
  , n = require('numbro')

module.exports = function container (get, set, clear) {
  var c = get('conf')
  var s = {options: minimist(process.argv)}
  var so = s.options
  
  var ws_timeout = 10000
  
  var pair, public_client, ws_client
  
  var ws_trades = []
  var ws_balance = []
  var ws_orders = [] 
  var ws_ticker = [] 
  var ws_hb = []
  var ws_walletCalcDone

  function publicClient () {
    if (!public_client) public_client = new BFX(null,null, {version: 2, transform: true}).rest
    return public_client
  }

  function wsUpdateTrades (pair, trades) {
    if (trades[0] === "tu") {
      trades = [trades[1]]
    } else if (trades[0] === "te") {
      return
    }
    
    trades.forEach(function (trade) {
      newTrade = {
        trade_id: Number(trade.ID),
        time: Number(trade.MTS),
        size: Math.abs(trade.AMOUNT),
        price: Number(trade.PRICE),
        side: trade.AMOUNT > 0 ? 'buy' : 'sell'
      }
      ws_trades.push(newTrade)
    })
    
    if (ws_trades.length > 1010)
      ws_trades.shift()
  }
  
  function wsUpdateTicker (pair, ticker) {
    ws_ticker = ticker        
  }

  function wsUpdateHb (message) {
    if (message[0] != "undefined")
      ws_hb[message[0]] = Date.now()
  }

  function wsSubscribed (event) {
    if (event.channel === "trades") {
      ws_hb[event.chanId] = Date.now()
  
      var intervalId = setInterval(function() {
        if (ws_hb[event.chanId]) {
          var timeoutThreshold = (Number(Date.now()) - ws_timeout)
          if (timeoutThreshold > ws_hb[event.chanId]) {
            console.warn(("\nWebSockets: No message on channel '" + ws_client.channelMap[event.chanId].channel + "' within " + ws_timeout / 1000 + ' seconds, reconnecting...').yellow)
            clearInterval(intervalId)
            ws_client.ws.close()
            ws_client.open()
          }
        }
      }, ws_timeout)      
    }
  }

  function wsOpen () {
    try {
      ws_client.auth()
    }
    catch (e) {
      console.warn(("\nWebSockets: Error on auth, retrying in " + ws_timeout / 1000 + ' seconds.').yellow)
      setTimeout(function() { wsOpen() }, ws_timeout)
      return
    }

    var chanId = 0
    ws_hb[chanId] = Date.now()

    var intervalId = setInterval(function() {
      if (ws_hb[chanId]) {
        var timeoutThreshold = (Number(Date.now()) - ws_timeout)
        if (timeoutThreshold > ws_hb[chanId]) {
          console.warn(("\nWebSockets: No message on channel 'auth' within " + ws_timeout / 1000 + ' seconds, reconnecting...').yellow)
          clearInterval(intervalId)
          ws_client.ws.close()
          ws_client.open()
        }
      }
    }, ws_timeout)

    ws_client.subscribeTrades(pair)
    ws_client.subscribeTicker(pair)
  }
  
  function wsUpdateOrder (ws_order) {
    cid = ws_order[2]

    // https://bitfinex.readme.io/v2/reference#ws-auth-orders
    var order = ws_orders['~' + cid]
    if (!order) {
      console.error(("\nERROR: Order " + cid + ' not found in cache (manual order?).').red)
      return
    }

    if (ws_order[13] === 'ACTIVE' || ws_order[13].match(/^PARTIALLY FILLED/)) {
      order.status = 'open'
    } else if (ws_order[13].match(/^EXECUTED/)) {
      order.status = 'done'
    } else if (ws_order[13] === 'CANCELED') {
      order.status = 'rejected'
    } else if (ws_order[13] === 'POSTONLY CANCELED') {
      order.status = 'rejected'
      order.reject_reason = 'post only'
    }

    order.bitfinex_id = ws_order[0]
    order.created_at = ws_order[4]
    order.filled_size = n(ws_order[7]).subtract(ws_order[6]).format('0.00000000')
    order.bitfinex_status = ws_order[13]
    order.price = ws_order[16]
    order.price_avg = ws_order[17]

    ws_orders['~' + cid] = order    
  }
  
  function wsUpdateOrderCancel (ws_order) {
    cid = ws_order[2]

    if (ws_orders['~' + cid])
    {
      setTimeout(function () {
        delete(ws_orders['~' + cid])
      }, 60000 * 60)
    }

    wsUpdateOrder(ws_order)
  }
  
  function wsUpdateReqOrder (error) {
    if (error[6] === 'ERROR' && error[7].match(/^Invalid order: not enough .* balance for/)) {
      cid = error[4][2]
      ws_orders['~' + cid].status = 'rejected'
      ws_orders['~' + cid].reject_reason = 'balance'
    }
  }
  
  function updateWallet (wallets) {
    if (typeof(wallets[0]) !== "object") wallets = [wallets]

    wallets.forEach(function (wallet) {
      if (wallet[0] === c.bitfinex.wallet) {
        ws_balance[wallet[1].toUpperCase()] = {}
        ws_balance[wallet[1].toUpperCase()].balance = wallet[2]
        ws_balance[wallet[1].toUpperCase()].available = wallet[4] ? wallet[4] : 0
        if (wallet[4]) { ws_walletCalcDone[wallet[1]] = true }
      }
    })
  }

  function wsClient () {
    if (!ws_client) {
      if (!c.bitfinex || !c.bitfinex.key || c.bitfinex.key === 'YOUR-API-KEY') {
        throw new Error('please configure your Bitfinex credentials in ' + path.resolve(__dirname, 'conf.js'))
      }
      ws_client = new BFX(c.bitfinex.key, c.bitfinex.secret, {version: 2, transform: true}).ws

      ws_client.on('error', function (e) {
        console.warn(("\nWebSockets: Error on connect, retrying in " + ws_timeout / 1000 + ' seconds.').yellow)
        ws_client.ws.close()
        setTimeout(function() {
          ws_client.open()
        }, ws_timeout)
      })
  
      ws_client
        .on('open', wsOpen)
        .on('subscribed', wsSubscribed)
        .on('message', wsUpdateHb)
        .on('trade', wsUpdateTrades)
        .on('ticker', wsUpdateTicker)
        .on('ws', updateWallet)
        .on('wu', updateWallet)
        .on('on', wsUpdateOrder)
        .on('on-req', wsUpdateReqOrder)
        .on('ou', wsUpdateOrder)
        .on('oc', wsUpdateOrderCancel)
    }
    
    return ws_client
  }
  
  function joinProduct (product_id) {
    return product_id.split('-')[0] + '' + product_id.split('-')[1]
  }
  
  function retry (method, args, cb) {
    if (so.debug) {
      console.log("\nWaiting " + ("1s").yellow + " for initial websockets snapshot.")
    }
    setTimeout(function () {
      exchange[method].call(exchange, args, cb)
    }, 1000)
  }

  function waitForCalc (method, args, cb) {
    setTimeout(function () {
      exchange[method].call(exchange, args, cb)
    }, 100)
  }
  
  function encodeQueryData(data) {
    let ret = []
    for (let d in data)
      ret.push(encodeURIComponent(d) + '=' + encodeURIComponent(data[d]))
    return ret.join('&')
  }
  
  var exchange = {
    name: 'bitfinex',
    historyScan: 'backward',
    makerFee: 0.1,
    takerFee: 0.2,
    
    getProducts: function () {
      return require('./products.json')
    },
    
    getTrades: function (opts, cb) {
      if (!pair) { pair = joinProduct(opts.product_id) }

      if (!ws_client) { ws_client = wsClient() }

      // Backfilling using the REST API
      if (opts.to || opts.to === null) {
        var func_args = [].slice.call(arguments)
        var client = publicClient()
        var args = {}
        args.sort = -1 //backward
        args.limit = 1000
        if (opts.from) {
          args.start = opts.from
        }
        else if (opts.to) {
          args.end = opts.to
        }
        else if (args.start && !args.end) {
          args.end = args.start + 500000
        }
        else if (args.end && !args.start) {
          args.start = args.end - 500000
        }
        var query = encodeQueryData(args)
        var tpair = 't' + joinProduct(opts.product_id)
        client.makePublicRequest('trades/' + tpair + '/hist?' + query, function (err, body) {
          if (err) return retry('getTrades', opts, cb)
          var trades = body.map(function(trade) {
            return {
              trade_id: trade.ID,
              time: trade.MTS,
              size: Math.abs(trade.AMOUNT),
              price: trade.PRICE,
              side: trade.AMOUNT > 0 ? 'buy' : 'sell'
            }
          })
          cb(null, trades)
        }) 
      } else {
        // We're live now (i.e. opts.from is set), use websockets
        if (typeof(ws_trades) === "undefined") { return retry('getTrades', opts, cb) }
        trades = ws_trades.filter(function (trade) { return trade.time >= opts.from })
        cb(null, trades)
      }
    },
    
    getBalance: function (opts, cb) {
      if (!pair) { pair = joinProduct(opts.asset + '-' + opts.currency) }
      if (pair && !ws_walletCalcDone) {
        ws_walletCalcDone = {}
        ws_walletCalcDone[opts.asset] = false
        ws_walletCalcDone[opts.currency] = false
      }

      if (!ws_client) { ws_client = wsClient() }
      if (Object.keys(ws_balance).length === 0) { return retry('getBalance', opts, cb) }

      if (ws_walletCalcDone[opts.asset] === false && ws_walletCalcDone[opts.currency] === false) {
        var ws_update_wallet = [
          0,
          'calc',
          null,
          [
            ["wallet_exchange_" + opts.currency],
            ["wallet_exchange_" + opts.asset]
          ]
        ]

        ws_client.send(ws_update_wallet)
        return waitForCalc('getBalance', opts, cb)
      }
      else if (
        (ws_walletCalcDone[opts.asset] === false && ws_walletCalcDone[opts.currency] === true) ||
        (ws_walletCalcDone[opts.asset] === true && ws_walletCalcDone[opts.currency] === false)
      ) {
        return waitForCalc('getBalance', opts, cb)
      }
      else {
        balance = {}
        balance.currency      = n(ws_balance[opts.currency].balance).format('0.00000000')
        balance.asset         = n(ws_balance[opts.asset].balance).format('0.00000000')

        balance.currency_hold = ws_balance[opts.currency].available ? n(ws_balance[opts.currency].balance).subtract(ws_balance[opts.currency].available).format('0.00000000') : n(0).format('0.00000000')
        balance.asset_hold    = ws_balance[opts.asset].available    ? n(ws_balance[opts.asset].balance).subtract(ws_balance[opts.asset].available).format('0.00000000')       : n(0).format('0.00000000')

        ws_walletCalcDone[opts.asset] = false
        ws_walletCalcDone[opts.currency] = false

        cb(null, balance)
      }
    },
    
    getQuote: function (opts, cb) {
      cb(null, { bid : String(ws_ticker.BID), ask : String(ws_ticker.ASK) })
    },
    
    cancelOrder: function (opts, cb) {
      order = ws_orders['~' + opts.order_id]
      ws_orders['~' + opts.order_id].reject_reason = "zenbot cancel"

      var ws_cancel_order = [
        0,
        'oc',
        null,
        {
          id: order.bitfinex_id
        }
      ]

      client.send(ws_cancel_order)
      cb()
    },
    
    trade: function (action, opts, cb) {
      if (!pair) { pair = joinProduct(opts.product_id) }
      var symbol = 't' + pair

      if (!ws_client) { ws_client = wsClient() }

      var cid = Math.round(((new Date()).getTime()).toString() * Math.random())
      var amount = action === 'buy' ? opts.size : opts.size * -1
      var price = opts.price

      if (opts.order_type === 'maker' && typeof opts.type === 'undefined') {
        opts.type = 'EXCHANGE LIMIT'
      }
      else if (opts.order_type === 'taker' && typeof opts.type === 'undefined') {
        opts.type = 'EXCHANGE MARKET'
      }
      if (typeof opts.post_only === 'undefined') {
        opts.post_only = true
      }
      var type = opts.type
      var is_postonly = opts.post_only

      var order = {
        id: cid,
        bitfinex_id: null,
        status: 'open',
        price: opts.price,
        size: opts.size,
        post_only: !!opts.post_only,
        created_at: new Date().getTime(),
        filled_size: 0,
        ordertype: opts.order_type
      }
      
      var ws_order = [
        0,
        'on',
        null,
        {
          cid: cid,
          type: type,
          symbol: symbol,
          amount: String(amount),
          price: price,
          hidden: 0,
          postonly: is_postonly ? 1 : 0
        }
      ]

      ws_client.send(ws_order)
      ws_orders['~' + cid] = order
      
      return cb(null, order)
    },
    
    buy: function (opts, cb) {
      exchange.trade('buy', opts, cb)
    },

    sell: function (opts, cb) {
      exchange.trade('sell', opts, cb)
    },
    
    getOrder: function (opts, cb) {
      var order = ws_orders['~' + opts.order_id]

      if (order.status === 'rejected' && order.reject_reason === 'post only') {        
        return cb(null, order)
      } else if (order.status === 'rejected' && order.reject_reason === 'zenbot canceled') {
        return cb(null, order)        
      }

      if (order.status == "done") {
        order.done_at = new Date().getTime()
        return cb(null, order)
      }

      cb(null, order)
    },
    
    // return the property used for range querying.
    getCursor: function (trade) {
      return (trade.time || trade)
    }
  }
  return exchange
}
