var bittrex = require('node.bittrex.api');
const readline = require('readline');
let _ = require('lodash');
var parseArgs = require('minimist');
let parsedArgs = parseArgs(process.argv.slice(2));
let file;

if(parsedArgs['f']) {
  file = "./config."+parsedArgs['f'];
} else {
  file = "./config";
}

let config = require(file);

var buyOrderPoll;
var sellPoll;
var sellOrderPoll;
let shares;
let availableBTC;
let disable_prompt = config.disable_prompt;
let apiKey = config.api_key || '';
let apiSecret = config.api_secret || '';
let desired_return = config.desired_return;
let include_fees = config.include_fees || false;
let stop_loss;
let flat_limits = config.flat_limits || false;

if(parsedArgs['k']) {
  apiKey = parsedArgs['k'];
}
if(parsedArgs['s']) {
  apiSecret = parsedArgs['s'];
}
if(parsedArgs['h']) {
  desired_return = parsedArgs['h'];
}
if(parsedArgs['l']) {
  stop_loss = parsedArgs['l'];
}
if(parsedArgs['y']) {
  disable_prompt = true;
}
if(parsedArgs['b']) {
  flat_limits = true;
}

if(apiKey && apiSecret) {
  bittrex.options({
    'apikey' : apiKey,
    'apisecret' : apiSecret,
  });
} else {
  exit('Could not read API keys, check config');
}

if(parsedArgs['_'].length == 0 || parsedArgs['help']) {
  console.log(`Usage: node pumpBot.js <coin> [options]`);
  console.log(`\nOptions: (options override config.js)\n`);
  console.log(`  -k <api_key>         API Key`);
  console.log(`  -s <api_secret>      API Secret`);
  console.log(`  -f <filename>        Specify an alternative configuration file (defaults to config.js)`);
  console.log(`  -h <desired_return>  Desired exit percentage in decimal format (e.g. 0.2 for 20%)`);
  console.log(`  -l <stop_loss>       Desired stop loss percentage in decimal format (e.g. 0.2 for 20%)`);
  console.log(`  -b                   Desired_return / Stop_loss are BTC prices, not percentage (e.g. 0.00025125)`);
  console.log(`  -y                   Skip the buy confirmation prompt and buy immediately`);
  console.log(`  --help               Display this message`);
  console.log(`\nExample Usage:\n`);
  console.log(`Buy VTC using a config file named 'config.trading.js' and sell when 20% gain reached, or when loss is 5%:\n`);
  console.log(`  node pumpBot.js vtc -f trading -h 0.2 -l 0.05`);
  console.log(`\nBuy XVG using a config file named 'config.bitcoin.js' and sell when 0.00000075 price reached, or when price is below 0.00000065:\n`);
  console.log(`  node pumpBot.js xvg -f trading -b -h 0.00000075 -l 0.00000065`);
  console.log(`\nBuy Bitbean with no stop loss and no confirmation prompt, only selling when 150% gains are reached:\n`);
  console.log(`  node pumpBot.js -h 1.5 -y bitb`);
  exit();
}
let coinPrice;
let latestAsk;
let filledPrice;
const coin = 'BTC-' + parsedArgs['_'].join('');

bittrex.getbalance({ currency : 'BTC' },( data, err ) => {
  if(err) {
    exit(`something went wrong with getBalance: ${err.message}`);
  }
  availableBTC = data.result.Available;
  getCoinStats();
});

/**
* getCoinStats - retrieves the current bid/ask/last for the given coin
**/
function getCoinStats() {
  bittrex.getticker( { market : coin },( data, err ) => {
    if(err) {
      exit(`something went wrong with getTicker: ${err.message}`);
    } else {
      console.log(`current Ask: Ƀ${displaySats(data.result.Ask)}`);
      console.log(`current Bid: Ƀ${displaySats(data.result.Bid)}`);
      console.log(`Last price:  Ƀ${displaySats(data.result.Last)}`);
      if (flat_limits && stop_loss > data.result.Bid) {
        exit('Stop loss of Ƀ'+stop_loss+' is higher than the current bid of Ƀ'+data.result.Bid+' - would sell immediately');
      }
      coinPrice = data.result.Ask + (data.result.Ask * config.market_buy_inflation);
      latestAsk = data.result.Ask;
      checkCandle();
    }
  });
}
/**
* checkCandle - retrieves the history of the given coin and compares the candle change to the configurable % change
**/
function checkCandle() {
  bittrex.getcandles({
    marketName: coin,
    tickInterval: 'oneMin'
  }, function(data, err) {
    if (err) {
      return exit(`something went wrong with getCandles: ${err.message}`);
    }
    let candles = _.takeRight(data.result,config.no_buy_threshold_time);
    let highAskDelta = (1.00-(candles[0].H/latestAsk)) * 100;
    //if we meet the threshold criteria, go ahead
    if(highAskDelta < (config.no_buy_threshold_percentage * 100)) {
      console.log(`${coin} has a ${highAskDelta.toFixed(2)}% gain/loss in the past ${data.result,config.no_buy_threshold_time} minutes`);
      if(!shares) {
        shares = (availableBTC * config.investment_percentage)/latestAsk;
      }
      showPrompt();
    } else {
      exit(`${coin} has increased past the ${config.no_buy_threshold_percentage * 100}% threshold (at ${highAskDelta.toFixed(2)}%), no buy will be made.`);
    }
  });
}

/**
* showPrompt - present a yes/no to the user whether they'd like to continue with the purchase
**/
function showPrompt() {
  if(!disable_prompt) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(`Are you sure you want to purchase ${shares} ${coin} at Ƀ${coinPrice.toFixed(8)}?\n`, (answer) => {
      if(answer === 'yes' || answer === 'y') {
        purchase();
      } else {
        rl.close();
      }
    });
  } else {
    purchase();
  }
}

/**
* pollOrder - poll the purchase order until it is filled
**/
function pollOrder(orderUUID) {
  console.log(`uuid: ${orderUUID}`);
  var buyOrderPoll = setInterval(() => {
    bittrex.getorder({uuid: orderUUID}, (data,err) => {
      if(err) {
        exit(`something went wrong with getOrderBuy: ${err.message}`);
      } else {
        console.log(data);
        if(data.result.IsOpen) {
          console.log(`order not yet filled`);
        } else if(data.result.CancelInitiated) {
          exit(`order cancel was initiated by user`);
        } else {
          if(config.auto_sell) {
            filledPrice = data.result.PricePerUnit;
            console.log(`ORDER FILLED at Ƀ${displaySats(data.result.PricePerUnit)}!`);
            clearInterval(buyOrderPoll);
            readline.emitKeypressEvents(process.stdin);
            process.stdin.setRawMode(true);
            process.stdin.on('keypress', (str, key) => {
              if (key.ctrl && key.name === 'c') {
                process.exit();
              } else if (key.ctrl && key.name === 's') {
                console.log('PANIC BUTTON DETECTED, SELLING IMMEDIATELY');
                console.log('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
                sellLow();
              }
            });
            sellPoll = setInterval(sell, 4000);
          } else {
            exit(`ORDER FILLED at Ƀ${displaySats(data.result.PricePerUnit)}!`);
          }
        }
      }
    });
  },2000);
}

/**
* purchase - initiates the purchase order for the coin
**/
function purchase() {
  if(config.fake_buy) {
    filledPrice = latestAsk;
    console.log(`ORDER FILLED at Ƀ${displaySats(filledPrice)}!`);
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.on('keypress', (str, key) => {
      if (key.ctrl && key.name === 'c') {
        process.exit();
      } else if (key.ctrl && key.name === 's') {
        console.log('PANIC BUTTON DETECTED, SELLING IMMEDIATELY');
        console.log('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
        console.log(`\n\nBut not really because this was a fake buy`);
        process.exit();
      }
    });
    sellPoll = setInterval(sell, 4000);
  } else {
    bittrex.buylimit({market: coin, quantity: shares, rate: coinPrice}, (data,err) => {
      if(err) {
        exit(`something went wrong with buyLimit: ${err.message}`);
      } else {
        pollOrder(data.result.uuid);
      }
    });
  }
}

function pollForSellComplete(uuid) {
  var sellOrderPoll = setInterval(() => {
    bittrex.getorder({uuid: uuid}, (data,err) => {
      if(err) {
        exit(`something went wrong with getOrderSell: ${err.message}`);
      } else {
        if(data.result.isOpen) {
          console.log(`sell order not filled yet`);
        } else if(data.result.CancelInitiated) {
          exit(`sell order cancel was initiated by user`);
        } else {
          clearInterval(sellOrderPoll);
          var sellTotal = data.result.Price * 0.995;
          var buyTotal = filledPrice * shares;
          var profitTotal = sellTotal - buyTotal;
          var profitPercent = ((sellTotal / buyTotal) - 1) * 100;
          if (profitTotal > 0) {
            console.log(`\nTotal Profit: Ƀ${displaySats(profitTotal)} (${profitPercent.toFixed(2)}%)\n\n`)
          } else {
            console.log(`\nTotal Loss: Ƀ${displaySats(profitTotal)} (${profitPercent.toFixed(2)}%)\n\n`)
          }
          exit(`SELL ORDER FILLED at Ƀ${displaySats(data.result.Price)}!`);
        }
      }
    });
  },2000);
}

/**
* sellLow - sells immediately at market rate
**/

function sellLow() {
  bittrex.getorderbook({market: coin,type: 'buy'}, (data,err) => {
    if(err) {
      console.log(`something went wrong with getOrderBook: ${err.message}`);
      return false;
    } else {
      sellPrice = data.result[0].Rate * 0.8;
      console.log(`Panic selling at Ƀ${displaySats(sellPrice)}`);
      bittrex.selllimit({market: coin, quantity: shares, rate: sellPrice}, (data,err) => {
        if(err) {
          exit(`something went wrong with sellLimit: ${err.message}`);
        } else {
          clearInterval(sellPoll);
          pollForSellComplete(data.result.uuid);
        }
      });
    }
  });
}


function sell() {
  let average_price = 0;
  let total_price = 0;
  let total_volume = 0;
  let count = 1;
  let sellPrice = 0;
  let purchasedVolume = shares;
  let gainSum = 0;
  let stopPrice = 0;

  if (flat_limits) {
    console.log(`polling for Ƀ${displaySats(desired_return)} exit price`);
  }
  else {
    console.log(`polling for ${desired_return * 100}% return`);
  }
  bittrex.getorderbook({market: coin,type: 'buy'}, (data,err) => {
    if(err) {
      console.log(`something went wrong with getOrderBook: ${err.message}`);
      return false;
    } else {
      sellPrice = data.result[0].Rate;
      console.log(`Evaluating selling at Ƀ${displaySats(sellPrice)}`);
      _.forEach(data.result, (order) => {
        //is initial volume higher than purchased volume?
        if(order.Quantity <= purchasedVolume) {
          let gain = (order.Quantity * order.Rate) / (filledPrice * order.Quantity) - 1;
          gainSum+= gain;
          purchasedVolume-= order.Quantity;
          count++;
        } else {
          let gain = (order.Rate * purchasedVolume) / (filledPrice * purchasedVolume) - 1;
          gainSum+= gain;
          let avgGain = (gainSum/count) * 100;
          if (include_fees)
            avgGain = avgGain - 0.5;
          console.log(`total gain on trade: ${avgGain.toFixed(2)}%`);
          if (flat_limits) {
            // sell based on btc price
            if (stop_loss) {
              if(sellPrice < stop_loss) {
                stopPrice = sellPrice * 0.9;
                console.log(`STOP LOSS TRIGGERED, SELLING FOR Ƀ${displaySats(sellPrice)} with order at Ƀ${displaySats(stopPrice)}`);
                bittrex.selllimit({market: coin, quantity: shares, rate: stopPrice}, (data,err) => {
                  if(err) {
                    exit(`something went wrong with sellLimit: ${err.message}`);
                  } else {
                    clearInterval(sellPoll);
                    pollForSellComplete(data.result.uuid);
                  }
                });
                return false;
              }
            }
            if(sellPrice >= desired_return) {
              console.log(`SELLING FOR Ƀ${displaySats(sellPrice)}`);
              bittrex.selllimit({market: coin, quantity: shares, rate: sellPrice}, (data,err) => {
                if(err) {
                  exit(`something went wrong with sellLimit: ${err.message}`);
                } else {
                  clearInterval(sellPoll);
                  pollForSellComplete(data.result.uuid);
                }
              });
              return false;
            } else {
              console.log(`GAIN DOES NOT PASS CONFIGURED THRESHOLD, NOT SELLING`);
              return false;
            }
          } else {
            // sell based on percentage
            if (stop_loss) {
              if(avgGain < (stop_loss * -100)) {
                stopPrice = sellPrice * 0.9;
                console.log(`STOP LOSS TRIGGERED, SELLING FOR Ƀ${displaySats(sellPrice)} with order at Ƀ${displaySats(stopPrice)}`);
                bittrex.selllimit({market: coin, quantity: shares, rate: stopPrice}, (data,err) => {
                  if(err) {
                    exit(`something went wrong with sellLimit: ${err.message}`);
                  } else {
                    clearInterval(sellPoll);
                    pollForSellComplete(data.result.uuid);
                  }
                });
                return false;
              }
            }
            if(avgGain >= (desired_return * 100)) {
              console.log(`SELLING FOR Ƀ${displaySats(sellPrice)}`);
              bittrex.selllimit({market: coin, quantity: shares, rate: sellPrice}, (data,err) => {
                if(err) {
                  exit(`something went wrong with sellLimit: ${err.message}`);
                } else {
                  clearInterval(sellPoll);
                  pollForSellComplete(data.result.uuid);
                }
              });
              return false;
            } else {
              console.log(`GAIN DOES NOT PASS CONFIGURED THRESHOLD, NOT SELLING`);
              return false;
            }
          }
        }
      });
    }
  });
}

function exit(message) {
  if(message) {
    console.log(message);
  }
  process.exit();
}

function displaySats(number) {
  return number.toFixed(8);
}
