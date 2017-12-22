let config = {
  // READ ONLY KEY

  api_key: '', // api key for bittrex API
  api_secret: '', // api secret for bittrex API

  // LIVE TRADE KEY

  // api_key: '',
  // api_secret: '',

  investment_percentage: .5, // how much of your current bittrex wallet do you want to invest
  no_buy_threshold_percentage: .2, // fail the buy if this percentage threshold has passed
  no_buy_threshold_time: 3, // time history (in minutes, max 10) to fail the buy if threshold is passed
  market_buy_inflation: .15, // set the market buy to currentPrice + inflation percentage
  disable_prompt: false, // bypass the 'are you sure?' before submitting the buy
  auto_sell: true, // automatically sell when the desired_return is triggered
  desired_return: .2, // percentage return expected when initiating a sell
  flat_limits: false, // desired_return and the stop loss figures use BTC price, not percentage
  include_fees: true, // include bittrex fees when calculating returns
  fake_buy: true, // fake buy call to test the flow of the application
  show_orderdata: true // prints order data from bittrex while you have an active order polling
};

module.exports = config;
