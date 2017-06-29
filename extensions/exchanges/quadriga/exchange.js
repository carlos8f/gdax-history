var QuadrigaCX = require('quadrigacx'),
    path = require('path'),
    colors = require('colors'),
    n = require('numbro')

module.exports = function container(get, set, clear) {
    var c = get('conf')
    var shownWarnings = false

    var public_client, authed_client

    function publicClient() {
        if (!public_client) public_client = new QuadrigaCX("1", "", "");
        return public_client
    }

    function authedClient() {
        if (!authed_client) {
            if (!c.quadriga || !c.quadriga.key || !c.quadriga.key === 'YOUR-API-KEY') {
                throw new Error('please configure your Quadriga credentials in ' + path.resolve(__dirname, 'conf.js'))
            }

            authed_client = new QuadrigaCX(c.quadriga.client_id, c.quadriga.key, c.quadriga.secret);
        }
        return authed_client
    }

    function joinProduct(product_id) {
        return (product_id.split('-')[0] + '_' + product_id.split('-')[1]).toLowerCase()
    }

    function retry(method, args) {
        if (method !== 'getTrades') {
            console.error(('\QuadrigaCX API is down! unable to call ' + method + ', retrying in 10s').red)
        }
        setTimeout(function() {
            exchange[method].apply(exchange, args)
        }, 10000)
    }

    var orders = {}

    var exchange = {
        name: 'quadriga',
        historyScan: 'backward',
        makerFee: 0.5,

        getProducts: function() {
            return require('./products.json')
        },

        getTrades: function(opts, cb) {
            var func_args = [].slice.call(arguments)
            var args = {
                book: joinProduct(opts.product_id),
                time: 'hour'
            }

            var client = publicClient()
            client.api('transactions', args, function(err, trades) {
                if (!shownWarnings) {
                    console.log('please note: the quadriga api does not support backfilling (trade/paper only).')
                    console.log('please note: make sure to set the period to 1h')
                    shownWarnings = true;
                }

                if (err) {
                    return retry('getTrades', func_args, err)
                }

                var trades = trades.map(function(trade) {
                    return {
                        trade_id: trade.tid,
                        time: trade.date,
                        size: trade.amount,
                        price: trade.price,
                        side: trade.side
                    }
                })

                cb(null, trades)
            })
        },

        getBalance: function(opts, cb) {
            var client = authedClient()
            client.api('balance', function(err, wallet) {
                if (err) {
                    return retry('getBalance', err)
                }

                var currency = opts.currency.toLowerCase()
                var asset = opts.asset.toLowerCase()

                var balance = {
                    asset: 0,
                    currency: 0
                }

                balance.currency = wallet[currency + '_balance'];
                balance.asset = wallet[asset + '_balance'];

                balance.currency_hold = wallet[currency + '_reserved']
                balance.asset_hold = wallet[asset + '_reserved']
                cb(null, balance)
            })
        },

        getQuote: function(opts, cb) {
            var func_args = [].slice.call(arguments)

            var params = {
                book: joinProduct(opts.product_id)
            }

            var client = publicClient()
            client.api('ticker', params, function(err, quote) {
                if (err) {
                    return retry('getQuote', func_args, err)
                }

                var r = {
                    bid: quote.bid,
                    ask: quote.ask
                }

                cb(null, r)
            })
        },

        cancelOrder: function(opts, cb) {
            var params = {
                id: opts.order_id
            }

            var client = authedClient()
            client.api('cancel_order', params, function(err, body) {
                if (err) return (err)
                cb()
            })
        },

        buy: function(opts, cb) {
            var params = {
                amount: opts.size,
                book: joinProduct(opts.product_id)
            }

            if (opts.order_type === 'maker' && typeof opts.type === 'undefined') {
                params.price = opts.price
            }

            var client = authedClient()
	    client.api('buy', params, function(err, body) {
		var order = {
		    id: body.id,
		    status: 'open',
		    price: opts.price,
		    size: opts.size,
		    created_at: new Date().getTime(),
		    filled_size: '0',
		    ordertype: opts.order_type
		}

		if (err) {
		    status: 'rejected'
		    reject_reason: 'balance'
		    return cb(null, order)
		}

		orders['~' + body.id] = order
		cp(null, order)
	    })
        },

        sell: function(opts, cb) {
            var params = {
                amount: opts.size,
                book: joinProduct(opts.product_id)
            }

            if (opts.order_type === 'maker' && typeof opts.type === 'undefined') {
                params.price = opts.price
            }
	    
	    var client = authedClient()
	    client.api('sell', params, function(err, body) {
                var order = {
                    id: body && body.is_live === true ? body.order_id : null,
                    status: 'open',
                    price: opts.price,
                    size: opts.size,
                    created_at: new Date().getTime(),
                    filled_size: '0',
                    ordertype: opts.order_type
                }
		
                if (err) {
                    status: 'rejected'
                    reject_reason: 'balance'
                    return cb(null, order)
                }

                orders['~' + body.id] = order
                cb(null, order)
            })
        },

        getOrder: function(opts, cb) {
            var order = orders['~' + opts.order_id]
	    
            var client = authedClient()
	    client.api('lookup_order', function(err, body) {
                if (err) return (err)
                if (!body.id) {
                    return cb('Order not found')
                }
                if (body.status === 2) {
                    order.status = 'done'
                    order.done_at = new Date().getTime()
                    order.filled_size = body.amount
                    return cb(null, order)
                }
                cb(null, order)
            })
        },

        // return the property used for range querying.
        getCursor: function(trade) {
            return trade.time
        }
    }
    return exchange
}
