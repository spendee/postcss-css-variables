const cssSelect = require('postcss-selector-parser')
const ancestors = {
  'html': true,
  ':root': true,
}

const mergeRootSpecifity = (rootPiece, piece) => {
  const res = cssSelect((selectors) => {
    selectors.walk((selector) => {
      if (!!ancestors[selector.value]) {
        selector.remove()
      }
    })
  }).processSync([rootPiece, piece].join(' '))

  return res
}

module.exports = mergeRootSpecifity