const cssSelect = require('postcss-selector-parser')
const isPieceAlwaysAncestorSelector = require('./is-piece-always-ancestor-selector')

const isPieceRootSpecificSelector = (piece) => 
  cssSelect((selectors) => {
    let isRootOrHtml = false
    let isSpecific = false
    
    selectors.walk((selector) => {
      if (isPieceAlwaysAncestorSelector(selector.value)) {
        isRootOrHtml = true
      } else if (isRootOrHtml) {
        isSpecific = true
      }
    })

    return isSpecific
  }).transformSync(piece)

module.exports = isPieceRootSpecificSelector