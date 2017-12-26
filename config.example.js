let config = {
  // READ ONLY KEY

  api_key: '', // api key for bittrex API
  api_secret: '', // api secret for bittrex API

  // LIVE TRADE KEY

  // api_key: '', // api key for bittrex API
  // api_secret: '', // api secret for bittrex API

  // These are percentage values in decimal. This means that .01 = 1%, .4 = 40%, and 1 = 100%. Don't use whole numbers, or the bot won't like it.

  investment_percentage: .5, // What percent of your bittrex wallet you want to invest, in BTC
  market_buy_inflation: .15, // This is to make sure your buy order gets in. Sets the market buy to current price + inflation percentage
  desired_return: .2, // Continue polling until this percentage return is met
  stop_loss: .1, // When the percentage threshold is hit, will initiate a market sell
  flat_limits: false, // Use BTC price for desired_return and the stop loss figures, instead of percentage.
  include_fees: true, // Include bittrex fees when calculating returns
  auto_sell: true, // Automatically sell when the desired_return is triggered
  
  // Safety
  
  no_buy_threshold_percentage: .2, // Checks if percentage threshold has passed within no_buy_threshold time. If it does pass it, it will fail to buy
  no_buy_threshold_time: 3, // Time history, (in minutes, max 10) to check against no_buy_threshold_percentage. i.e DOGE gained 20% within 3 minutes, the bot will not buy
  disable_prompt: false, // Bypass the 'Are you sure?' before submitting the buy
  fake_buy: true, // Fake buy call to test the flow of the application without using your real portfolio
  
  // Other
  
  show_uuid: true // Prints order uuid from bittrex while you have an active order polling
};

module.exports = config;
