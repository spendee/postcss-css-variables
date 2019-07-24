const declarationToString = (decl) => `${decl.prop}: ${decl.value}`

const declarationRuleToString = (decl) => {
  const result = []

  if (!decl) return `undefined`
  
  if (decl.parent && decl.parent.parent && decl.parent.parent.type === 'atrule') {
    result.push(`@media(${decl.parent.parent.type})`)
  }

  if (decl.parent) {
    result.push(decl.parent.selector)
  }

  return result.filter(Boolean).join(" ")
}

const mapItemToString = ({ prop, decl, calculatedInPlaceValue }) => {
  return [declarationRuleToString(decl), `${prop} = ${calculatedInPlaceValue}`].filter(Boolean).join(" ")
}

const logDepth = (depth, ...tags) => (...args) => {
  if (!process.env.VERBOSE) return
  console.log('  '.repeat(depth), ...tags, ...args)
}

const log = logDepth(0)


module.exports = {
  declarationToString,
  declarationRuleToString,
  mapItemToString,
  log,
  logDepth,
}