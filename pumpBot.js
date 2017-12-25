var bittrex = require('node.bittrex.api');
var term = require( 'terminal-kit' ).terminal;
const readline = require('readline');
let _ = require('lodash');
var parseArgs = require('minimist');
let parsedArgs = parseArgs(process.argv.slice(2));
let file;

var tradeType;
var str1 = 'BTC-' + parsedArgs['_'].join('');
var str2 = '' + parsedArgs['_'].join('');
const coin = str1.toUpperCase();
const justCoin = str2.toUpperCase();

term.windowTitle('Bittrex PumpBot')
term.reset();
term.eraseDisplay();
term.scrollingRegion(19, 29);

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
let show_orderdata = config.show_orderdata || false;

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
  exit('Could not read API keys, check config.');
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
let counter;
counter = 0;

checkValidInvestment();
// checkValidWindowSize();

bittrex.getbalance({ currency : 'BTC' },( data, err ) => {
  if(err) {
    exit(`Something went wrong with getBalance: ${err.message}`);
  }
  availableBTC = data.result.Available;
  getCoinStats();
});

/**
* getCoinStats - retrieves the current bid/ask/last for the given coin
**/
function getCoinStats() {
  term.moveTo(1, 1, `Coin:`);
  term.moveTo.brightCyan(16, 1, `${justCoin}`)
  bittrex.getticker( { market : coin },( data, err ) => {
    if(err) {
      term.nextLine(1);
      exit(`Something went wrong with getTicker: ${err.message}`);
    } else {
      term.moveTo(1, 3, `Current Ask: `);
      term.moveTo.brightGreen(16, 3, `Ƀ ${displaySats(data.result.Ask)}`);
      term.moveTo(1, 4, `Current Bid: `);
      term.moveTo.brightGreen(16, 4, `Ƀ ${displaySats(data.result.Bid)}`);
      term.moveTo(1, 5, `Last Price:  `);
      term.moveTo.brightGreen(16, 5, `Ƀ ${displaySats(data.result.Last)}`);
      
      if (flat_limits && stop_loss > data.result.Bid) {
        term.nextLine(1);
        term('Stop loss of ').brightGreen('Ƀ '+ stop_loss) (' is higher than the current bid of ').brightGreen('Ƀ '+data.result.Bid) (' - would sell immediately.');
        term.nextLine(4);
        process.exit();
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
      term.nextLine(1);
      return exit(`Something went wrong with getCandles: ${err.message}`);
    }
    let candles = _.takeRight(data.result,config.no_buy_threshold_time);
    let highAskDelta = (1.00-(candles[0].H/latestAsk)) * 100;
    //if we meet the threshold criteria, go ahead
    if(highAskDelta < (config.no_buy_threshold_percentage * 100)) {

      if(highAskDelta.toFixed(2).indexOf("-") > -1)
      {
        term.moveTo(1, 7).brightCyan(`${coin}`) (` has a `).brightRed(`${highAskDelta.toFixed(2)} %`) (` loss in the past ${data.result,config.no_buy_threshold_time} minutes`);
      }
      else
      {
        term.moveTo(1, 7).brightCyan(`${coin}`) (` has a `).brightGreen(`${highAskDelta.toFixed(2)} %`) (` gain in the past ${data.result,config.no_buy_threshold_time} minutes`);
      }

      if(!shares) {
        shares = (availableBTC * config.investment_percentage)/latestAsk;
      }
      showPrompt();
    } else {
      term.nextLine(2);
      term.brightCyan(`${coin}`) (` has increased past the `).brightGreen(`${config.no_buy_threshold_percentage * 100} %`) (` threshold (at `).brightGreen(`${highAskDelta.toFixed(2)} %)`) (` no buy will be made.`);
      term.nextLine(2);
      process.exit;
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
    term.moveTo(1, 9);
    term(`You are purchasing `).brightGreen(`${shares.toFixed(8)}`).brightCyan(` ${justCoin}`) (` at `).brightGreen(`Ƀ ${coinPrice.toFixed(8)}`);
    term.nextLine(2);
    rl.question(`Are you sure want to do this? (Y/N) `, (answer) => 
    {
      if(answer === 'yes' || answer === 'y' || answer === 'Yes' || answer === 'yy' || answer === 'Y' || answer === 'YES') { // Typos happen, can be lost profit during a pump.
        purchase();
      } else {
        term.moveTo(1, 13, `Purchase cancelled by user.\n\n`);
        rl.close();
      }
    });
  } else {
    term.nextLine(2);
    purchase();
  }
}

/**
* pollOrder - poll the purchase order until it is filled
**/
function pollOrder(orderUUID) {

  term.saveCursor();

  if (flat_limits) {
    term.moveTo(1, 15);
    term.nextLine(2);
    term(`===================== ORDER STATUS =====================`);
    term.nextLine(2);
  }
  else {
    term.moveTo(1, 15);
    term.nextLine(2);
    term(`===================== ORDER STATUS =====================`);
    term.nextLine(2);
  }

  term.moveTo(3, 28, `${counter}`);
  counter = counter + 1;
  //term.moveTo(1, 30, `========= 'Ctrl + Up' to RAISE YOUR BUY ORDER  =========`); NOT YET
  term.moveTo(1, 30, `========================================================`);

  term.restoreCursor();

  if(show_orderdata) {
    term(`Order UUID: ${orderUUID}\n`);
  }
  var buyOrderPoll = setInterval(() => {
    bittrex.getorder({uuid: orderUUID}, (data,err) => {
      if(err) {
        exit(`Something went wrong with getOrderBuy: ${err.message}`);
      } else {
        /*if(show_orderdata) {
          term(data);
        }*/
        if(data.result.IsOpen) {
          term(`Buy order is not yet filled.\n`);
        } else if(data.result.CancelInitiated) {
          exit(`Buy order cancel initiated by user.`);
        } else {
          if(config.auto_sell) {
            filledPrice = data.result.PricePerUnit;
            term.moveTo(1,13);
            term(`ORDER FILLED at `).brightGreen(`Ƀ ${displaySats(data.result.PricePerUnit)}\n`);
            clearInterval(buyOrderPoll);
            readline.emitKeypressEvents(process.stdin);
            process.stdin.setRawMode(true);
            process.stdin.on('keypress', (str, key) => {
              if (key.ctrl && key.name === 'c') {
                term.nextLine(4);
                process.exit();
              } else if (key.ctrl && key.name === 's') {
                term(`\n`);
                term.right(2);
                term.brightCyan('PANIC BUTTON DETECTED, SELLING IMMEDIATELY\n\n');
                sellLow();
              }
            });

            term.moveTo(1, 14);
            term.eraseDisplayBelow();

            term.moveTo(1, 28);
            term.hideCursor();
            tradeType = 'LIVE TRADE';
            sellPoll = setInterval(sell, 4000);
          } else {
            term.right(2);
            term(`ORDER FILLED at `).brightGreen(`Ƀ ${displaySats(data.result.PricePerUnit)}\n`);
            term.nextLine(4);
            process.exit();
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
    term.nextLine(1);
    term(`ORDER FILLED at `).brightGreen(`Ƀ ${displaySats(filledPrice)}\n`);
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.on('keypress', (str, key) => {
      if (key.ctrl && key.name === 'c') {
        term.nextLine(4);
        process.exit();
      } else if (key.ctrl && key.name === 's') {
        term(`\n`);
        term.right(2);
        term.brightCyan('PANIC BUTTON DETECTED, SELLING IMMEDIATELY\n\n');
        term.right(2);
        term(`But not really because this was a fake buy.\n`);
        term.nextLine(4);
        process.exit();
      }
    });

    term.moveTo(1, 28);
    term.hideCursor();
    tradeType = ' FAKE BUY ';
    sellPoll = setInterval(sell, 4000);
  } else {
    bittrex.buylimit({market: coin, quantity: shares, rate: coinPrice}, (data,err) => {
      if(err) {
        term.nextLine(1);
        exit(`Something went wrong with buyLimit: ${err.message}`);
      } else {
        term.moveTo(1, 28);
        term.hideCursor();

        pollOrder(data.result.uuid);
      }
    });
  }
}

/**
* pollForSellComplete - poll the purchase order until it is cancelled or filled.
**/
function pollForSellComplete(uuid) {
  var sellOrderPoll = setInterval(() => {
    bittrex.getorder({uuid: uuid}, (data,err) => {
      if(err) {
        exit(`Something went wrong with getOrderSell: ${err.message}`);
      } else {
        if(data.result.isOpen) {
          term.right(2);
          term(`Sell order not yet filled.\n`);
        } else if(data.result.CancelInitiated) {
          exit(`Sell order cancel was initiated by user.`);
        } else {
          clearInterval(sellOrderPoll);
          var sellTotal = data.result.Price * 0.995;
          var buyTotal = filledPrice * shares;
          var profitTotal = sellTotal - buyTotal;
          var profitPercent = ((sellTotal / buyTotal) - 1) * 100;

          if (profitTotal > 0) {
            term.right(2);
            term(`Total Profit: `).brightGreen(`Ƀ ${displaySats(profitTotal)}`)(` | `).brightGreen(`${profitPercent.toFixed(2)} %\n\n`);
          } else {
            term.right(2);
            term(`Total Profit: `).brightRed(`Ƀ ${displaySats(profitTotal)}`)(` | `).brightRed(`${profitPercent.toFixed(2)} %\n\n`);
          }
          term.right(2);
          term(`SELL ORDER FILLED at `).brightGreen(`Ƀ ${displaySats(data.result.Price)}\n`);
          term.nextLine(4);
          process.exit();
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
      term(`Something went wrong with getOrderBook: ${err.message}\n`);
      return false;
    } else {
      sellPrice = data.result[0].Rate * 0.8;
      term.right(2);
      term(`Panic selling at `).brightGreen(`Ƀ ${displaySats(sellPrice)}\n\n`);
      bittrex.selllimit({market: coin, quantity: shares, rate: sellPrice}, (data,err) => {
        if(err) {
          exit(`Something went wrong with sellLimit: ${err.message}`);
        } else {
          clearInterval(sellPoll);
          pollForSellComplete(data.result.uuid);
        }
      });
    }
  });
}

/**
* cancel - (todo) initiates a cancel request for last order made
**/
function cancel() {
  bittrex.cancel({uuid: orderUUID}, (data,err) => {
    if(err) {
      exit(`Something went wrong with cancelling your order: ${err.message}`);
    } else {
      term(`Previous order cancelled.\n`);
      buyAgain();
    }
  });
}

/**
* buyAgain - (todo) rebuys at new market price
**/
function buyAgain() {

}

/**
* sell - mitochondria is the powerhouse of the cell
**/
function sell() {
  let average_price = 0;
  let total_price = 0;
  let total_volume = 0;
  let count = 1;
  let sellPrice = 0;
  let purchasedVolume = shares;
  let gainSum = 0;
  let stopPrice = 0;

  term.saveCursor();

  if (flat_limits) {
    term.moveTo(1, 15, `Polling For: `);
    term.brightGreen(`Ƀ ${displaySats(desired_return)}`);
    term.nextLine(2);
    term(`====================== ` + tradeType + ` ======================`);
    term.nextLine(2);
  }
  else {
    term.moveTo(1, 15, `Polling For: `);
    term.brightGreen(`${desired_return * 100} %`);
    term.nextLine(2);
    term(`====================== ` + tradeType + ` ======================`);
    term.nextLine(2);
  }

  term.restoreCursor();

  bittrex.getorderbook({market: coin,type: 'buy'}, (data,err) => {
    if(err) {
      term(`Something went wrong with getOrderBook: ${err.message}\n`);
      return false;
    } else {
      term.saveCursor();

      term.moveTo(3, 28, `${counter}`);
      counter = counter + 1;
      term.moveTo(1, 30, `============ 'Ctrl + S' to IMMEDIATELY SELL ============`);

      term.restoreCursor();

      sellPrice = data.result[0].Rate;
      term.right(12);
      term(`Price: `);
      term.brightGreen(`Ƀ ${displaySats(sellPrice)}`);

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

          if(avgGain.toFixed(2).indexOf("-") > -1)
          {
            term.right(7);
            term(`Gain: `);
            term.brightRed(`${avgGain.toFixed(2)} %\n`);
          }
          else
          {
            term.right(7);
            term(`Gain: `);
            term.brightGreen(`${avgGain.toFixed(2)} %\n`);
          }

          if (flat_limits) {
            // sell based on btc price
            if (stop_loss) {
              if(sellPrice < stop_loss) {
                stopPrice = sellPrice * 0.9;
                term.right(2);
                term(`STOP LOSS TRIGGERED, SELLING FOR `).brightRed(`Ƀ ${displaySats(sellPrice)}`)(` with order at `).brightRed(`Ƀ ${displaySats(stopPrice)}\n`);
                bittrex.selllimit({market: coin, quantity: shares, rate: stopPrice}, (data,err) => {
                  if(err) {
                    exit(`Something went wrong with sellLimit: ${err.message}`);
                  } else {
                    clearInterval(sellPoll);
                    pollForSellComplete(data.result.uuid);
                  }
                });
                return false;
              }
            }

            if(sellPrice >= desired_return) {
              term(`\n`);
              term.right(2);
              term(`SELLING FOR `).brightGreen(`Ƀ ${displaySats(sellPrice)}\n\n`);
              bittrex.selllimit({market: coin, quantity: shares, rate: sellPrice}, (data,err) => {
                if(err) {
                  exit(`Something went wrong with sellLimit: ${err.message}`);
                } else {
                  clearInterval(sellPoll);
                  pollForSellComplete(data.result.uuid);
                }
              });
              return false;
            } else {
              return false;
            }
          } else {
            // sell based on percentage
            if (stop_loss) {
              if(avgGain < (stop_loss * -100)) {
                stopPrice = sellPrice * 0.9;
                term(`\n`);
                term.right(2);
                term(`STOP LOSS TRIGGERED, SELLING FOR `).brightRed(`Ƀ ${displaySats(sellPrice)}`) (` with order at `).brightRed(`Ƀ ${displaySats(stopPrice)}\n\n`);
                bittrex.selllimit({market: coin, quantity: shares, rate: stopPrice}, (data,err) => {
                  if(err) {
                    exit(`Something went wrong with sellLimit: ${err.message}`);
                  } else {
                    clearInterval(sellPoll);
                    pollForSellComplete(data.result.uuid);
                  }
                });
                return false;
              }
            }
            if(avgGain >= (desired_return * 100)) {
              term(`\n`);
              term.right(2);
              term(`SELLING FOR `).brightGreen(`Ƀ ${displaySats(sellPrice)}\n\n`);
              bittrex.selllimit({market: coin, quantity: shares, rate: sellPrice}, (data,err) => {
                if(err) {
                  exit(`Something went wrong with sellLimit: ${err.message}`);
                } else {
                  clearInterval(sellPoll);
                  pollForSellComplete(data.result.uuid);
                }
              });
              return false;
            } else {
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
    term(message);
    term.nextLine(4);
    term.hideCursor();
  }
  process.exit();
}

function displaySats(number) {
  return number.toFixed(8);
}

function checkValidInvestment() {
  if(config.investment_percentage + config.market_buy_inflation >= .99) {
    term.nextLine(1);
    term(`Investment % + Inflation % + (Fee) totals over 100%.\nPlease lower one of first two in your config file.`);
    term.nextLine(2);
    process.exit();
  }
}

/*
function checkValidWindowSize() {
  if(process.stdout.columns < 60 || process.stdout.rows < 34) {
    term.nextLine(1);
    term(`Your window size must be at least 60 x 34 (rows x columns) for it to display properly`);
    term.nextLine(1);
    term(`Please resize your window by making it larger and try again (height matters most)`)
    term.nextLine(1);
    process.exit();
  }
}*/