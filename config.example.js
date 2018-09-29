let config = {

  preferredExchange: 'binance', //If the coin is listed on both binance and bittrex, which exchange do you want to give priority (binance/bittrex/both)
  market_buy_inflation: .1, // This is to make sure your buy order gets in. Sets the market buy to current price + inflation percentage
  auto_sell: true, // Automatically sell when the desired_return is triggered. If false, will exit immediately after buy order is filled

  /**
  * This section pertains to Bittrex only
  **/
  bittrex: {
    // READ ONLY KEY

    //api_key: '0fada9d4cde54c599e25e4103ae1665b', // api key for bittrex API
    //api_secret: '4e206f2b3adc4d009dca4101cac248e5', // api secret for bittrex API

    // TRADE KEY
    api_key: '',
    api_secret: '',
    investment: .001
  },
  /**
  * This section pertains to Binance only
  **/
  binance: {
    // READ ONLY KEY

    //api_key: '', // api key for binance API
    //api_secret: '', // api secret for binance API

    // TRADE KEY
    api_key: '',
    api_secret: '',
    investment: 1
  },
};

module.exports = {
  bittrex: config.bittrex,
  binance: config.binance,
  main: config
};
