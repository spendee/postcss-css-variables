var generateScopeList = require('./generate-scope-list');
var isNodeUnderScope = require('./is-node-under-scope');
var gatherVariableDependencies = require('./gather-variable-dependencies');

var findNodeAncestorWithSelector = require('./find-node-ancestor-with-selector');
var cloneSpliceParentOntoNodeWhen = require('./clone-splice-parent-onto-node-when');

const chalk = require('chalk')
const declToStr = (decl) => `${decl.prop}: ${decl.value}`
const logResult = (depth, ...args) => {
	console.log([...Array(depth).keys()].map(() => '  ').join(''), ...args)
}


// var() = var( <custom-property-name> [, <any-value> ]? )
// matches `name[, fallback]`, captures "name" and "fallback"
// See: http://dev.w3.org/csswg/css-variables/#funcdef-var
var RE_VAR_FUNC = (/var\(\s*(--[^,\s]+?)(?:\s*,\s*(.+))?\s*\)/);

function toString(value) {
	return String(value);
}

// Pass in a value string to parse/resolve and a map of available values
// and we can figure out the final value
//
// `ignorePseudoScope`: Optional bool to determine whether the scope resolution should be left alone or not
//
// Note: We do not modify the declaration
// Note: Resolving a declaration value without any `var(...)` does not harm the final value.
//		This means, feel free to run everything through this function
var resolveValue = function(decl, map, /*optional*/ignorePseudoScope, depth = 0) {
	const log = (...args) => logResult(depth, chalk.blue('value'), ...args)
	var resultantValue = toString(decl.value);
	var warnings = [];

	var variablesUsedInValueMap = {};
	// Use `replace` as a loop to go over all occurrences with the `g` flag
	resultantValue.replace(new RegExp(RE_VAR_FUNC.source, 'g'), function(match, variableName, fallback) {
		variablesUsedInValueMap[variableName] = true;
	});
	var variablesUsedInValue = Object.keys(variablesUsedInValueMap);

	log(resultantValue, variablesUsedInValue)

	// Resolve any var(...) substitutons
	var isResultantValueUndefined = false;
	resultantValue = resultantValue.replace(new RegExp(RE_VAR_FUNC.source, 'g'), function(match, variableName, fallback) {
		// Loop through the list of declarations for that value and find the one that best matches
		// By best match, we mean, the variable actually applies. Criteria:
		//		- is under the same scope
		//		- The latest defined `!important` if any
		var matchingVarDeclMapItem;
		log('Finding matching declaration');

		(map[variableName] || []).forEach(function(varDeclMapItem) {
			// Make sure the variable declaration came from the right spot
			// And if the current matching variable is already important, a new one to replace it has to be important
			log("testing =", chalk.blue(declToStr(varDeclMapItem.decl)))
			var underScsopeIgnorePseudo = isNodeUnderScope(decl.parent, varDeclMapItem.parent, ignorePseudoScope, depth + 1);

			if(
				underScsopeIgnorePseudo &&
				// And if the currently matched declaration is `!important`, it will take another `!important` to override it
				(!(matchingVarDeclMapItem || {}).isImportant || varDeclMapItem.isImportant)
			) {
				log("candidate =", varDeclMapItem && chalk.blue(declToStr(varDeclMapItem.decl)))
				matchingVarDeclMapItem = varDeclMapItem;
			}
		});

		// Default to the calculatedInPlaceValue which might be a previous fallback, then try this declarations fallback
		var replaceValue = (matchingVarDeclMapItem || {}).calculatedInPlaceValue || (function() {
			// Resolve `var` values in fallback
			var fallbackValue = fallback;
			if(fallback) {
				var fallbackDecl = decl.clone({ parent: decl.parent, value: fallback });
				fallbackValue = resolveValue(fallbackDecl, map, false, depth + 1).value;
			}

			return fallbackValue;
		})();

		// Otherwise if the dependency health is good(no circular or self references), dive deeper and resolve
		if(matchingVarDeclMapItem !== undefined && !gatherVariableDependencies(variablesUsedInValue, map).hasCircularOrSelfReference) {
			log('Resolving the value itself')
			// Splice the declaration parent onto the matching entry

			var varDeclScopeList = generateScopeList(decl.parent.parent, true);
			var innerMostAtRuleSelector = varDeclScopeList[0].slice(-1)[0];
			var nodeToSpliceParentOnto = findNodeAncestorWithSelector(innerMostAtRuleSelector, matchingVarDeclMapItem.decl.parent);
			log('under at rule', innerMostAtRuleSelector)
			// See: `test/fixtures/cascade-with-calc-expression-on-nested-rules`
			var matchingMimicDecl = cloneSpliceParentOntoNodeWhen(matchingVarDeclMapItem.decl, decl.parent.parent, function(ancestor) {
				return ancestor === nodeToSpliceParentOnto;
			});

			replaceValue = resolveValue(matchingMimicDecl, map, false, depth + 1).value;
			log(`self reference = ${replaceValue}`)
		}

		isResultantValueUndefined = replaceValue === undefined;
		if(isResultantValueUndefined) {
			warnings.push(['variable ' + variableName + ' is undefined and used without a fallback', { node: decl }]);
		}

		//console.log(debugIndent, 'replaceValue', replaceValue);

		return replaceValue;
	});

	return {
		// The resolved value
		value: !isResultantValueUndefined ? resultantValue : undefined,
		// Array of variable names used in resolving this value
		variablesUsed: variablesUsedInValue,
		// Any warnings generated from parsing this value
		warnings: warnings
	};
};

resolveValue.RE_VAR_FUNC = RE_VAR_FUNC;


module.exports = resolveValue;
