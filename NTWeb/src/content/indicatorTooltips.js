export const INDICATOR_TOOLTIPS = {
  RSI: {
    title: 'RSI',
    what: 'Relative Strength Index measures momentum.',
    calc: "Calculated using average gains vs losses over a period.",
    means: 'Above 70 = overbought (bearish), below 30 = oversold (bullish).',
  },
  MACD: {
    title: 'MACD',
    what: 'Moving Average Convergence Divergence tracks trend strength.',
    calc: 'Based on the difference between short-term and long-term EMAs.',
    means: 'Bullish when MACD crosses above the signal line.',
  },
  'Bollinger Bands': {
    title: 'Bollinger Bands',
    what: 'Shows price volatility using upper and lower bands.',
    calc: 'Based on a moving average with bands above/below it.',
    means: 'Near upper band = overbought, near lower band = oversold.',
  },
  StochRSI: {
    title: 'StochRSI',
    what: 'Stochastic RSI highlights RSI momentum shifts.',
    calc: "Calculated by comparing RSI's current level to its recent range.",
    means: 'Above 0.8 = overbought (bearish), below 0.2 = oversold (bullish).',
  },
}

