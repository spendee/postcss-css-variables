const cssSelect = require('postcss-selector-parser')

const PSEUDO_TO_NOT_STRIP = {
  ':root': true,
  ':global': true,
  ':not': true,
}

const stripPseudoSelectors = (piece) => cssSelect((root) => {
  root.walkPseudos((selector) => {
    if (!PSEUDO_TO_NOT_STRIP[selector.value]) {
      selector.remove()
    }
  })
}).processSync(piece)

const getStripablePseudos = (piece) => cssSelect((root) => {
  const stripable = []
  root.walkPseudos((selector) => {
    if (!PSEUDO_TO_NOT_STRIP[selector.value]) {
      stripable.push(selector.value)
    }
  })
  return stripable
}).transformSync(piece)

module.exports = stripPseudoSelectors
module.exports.getStripablePseudos = getStripablePseudos