var resolveValue = require('./resolve-value');
var generateScopeList = require('./generate-scope-list');
var gatherVariableDependencies = require('./gather-variable-dependencies');

var isNodeUnderScope = require('./is-node-under-scope');

var shallowCloneNode = require('./shallow-clone-node');
var findNodeAncestorWithSelector = require('./find-node-ancestor-with-selector');
var cloneSpliceParentOntoNodeWhen = require('./clone-splice-parent-onto-node-when');
var mergeRootSpecifity = require('./merge-root-specifity')

const { getStripablePseudos } = require('./strip-pseudo-selectors')
const { log, declarationToString, mapItemToString } = require('./logging')
const chalk = require('chalk')

function eachMapItemDependencyOfDecl(variablesUsedList, map, decl, cb) {
	// Now find any at-rule declarations that pertains to each rule
	// Loop through the variables used
	log(chalk.red('Variables used'), variablesUsedList)
	variablesUsedList.forEach(function(variableUsedName) {

		// Find anything in the map that corresponds to that variable
		log(gatherVariableDependencies(variablesUsedList, map).deps.map(mapItemToString).join('\n'))
		gatherVariableDependencies(variablesUsedList, map).deps.forEach(function(mapItem) {

			var mimicDecl;
			if(mapItem.isUnderAtRule) {

				log(chalk.cyan('\n[[@atrule]]'), `Resolving: ${mapItemToString(mapItem)}`)
				// Get the inner-most selector of the at-rule scope variable declaration we are matching
				//		Because the inner-most selector will be the same for each branch, we can look at the first one [0] or any of the others
				var varDeclScopeList = generateScopeList(mapItem.parent, true);
				var innerMostAtRuleSelector = varDeclScopeList[0].slice(-1)[0];
				var nodeToSpliceParentOnto = findNodeAncestorWithSelector(innerMostAtRuleSelector, decl.parent);

				// attept to add a specific root scope if necessary
				if (mapItem.isRootSpecific) {
					log(chalk.red("Need another scope insertion"))
					const varDeclRootRule = mapItem.parent
					const nodeToSpliceParentOnto = findNodeAncestorWithSelector(mapItem.parent.selector, decl.parent)

					mimicDecl = cloneSpliceParentOntoNodeWhen(decl, varDeclRootRule, (ancestor) => ancestor === nodeToSpliceParentOnto)

					log(chalk.yellow('root specific'), 'current declaration', generateScopeList(decl.parent, true))
					log(chalk.yellow('root specific'), 'scope of the parent', generateScopeList(mapItem.parent, true))
					log(chalk.yellow('root specific'), 'new scoped', generateScopeList(mimicDecl.parent, true))
					log(chalk.yellow('root specific'), chalk.red("Scope should be inserted"))
				} else {
					// Splice on where the selector starts matching the selector inside at-rule
					// See: `test/fixtures/cascade-on-nested-rules.css`
					var varDeclAtRule = mapItem.parent.parent
					mimicDecl = cloneSpliceParentOntoNodeWhen(mimicDecl || decl, varDeclAtRule, function(ancestor) {
						return ancestor === nodeToSpliceParentOnto;
					});
					
					log('current declaration', generateScopeList(decl.parent, true));
					log('scope of the parent', generateScopeList(mapItem.parent, true));
					log('new scoped', generateScopeList(mimicDecl.parent, true));
				}
				

				//console.log('amd og', generateScopeList(decl.parent, true));
				//console.log('amd', generateScopeList(mimicDecl.parent, true));
				//console.log(generateScopeList(mapItem.parent, true));
				//console.log('amd isNodeUnderScope', isNodeUnderScope(mimicDecl.parent, mapItem.parent), mapItem.decl.value);
			}
			else if (mapItem.isRootSpecific) {
				log(chalk.yellow('\n[[:root]]'), `Resolving: ${mapItemToString(mapItem)}`, mapItem.parent.selectors)

				const varDeclRootRule = mapItem.parent
				const nodeToSpliceParentOnto = findNodeAncestorWithSelector(mapItem.parent.selector, decl.parent)

				mimicDecl = cloneSpliceParentOntoNodeWhen(decl, varDeclRootRule, (ancestor) => ancestor === nodeToSpliceParentOnto)

				log('current declaration', generateScopeList(decl.parent, true))
				log('mimicDecl selector', mimicDecl.parent.selector)
				log('new scoped', generateScopeList(mimicDecl.parent, true))
				log('scope of variable', generateScopeList(mapItem.parent, true))
			}
			// TODO: use regex from `isUnderScope`
			else if (getStripablePseudos(mapItem.parent.selector).length > 0) {

				log(chalk.red('\n[[:pseudo]]'), 'Using pseudo elements')
				// Create a detached clone
				var ruleClone = shallowCloneNode(decl.parent);
				ruleClone.parent = decl.parent.parent;

				// Add the declaration to it
				mimicDecl = decl.clone();
				ruleClone.append(mimicDecl);

				const stripable = getStripablePseudos(mapItem.parent.selector)
				const lastPseudoSelector = stripable.length ? stripable.splice(-1, 1) : '';

				ruleClone.selector += lastPseudoSelector;
			}

			// If it is under the proper scope,
			// we need to check because we are iterating over all map entries
			if(mimicDecl && isNodeUnderScope(mimicDecl, mapItem.parent, true)) {
				cb(mimicDecl, mapItem);
			} else {
				log('FOR-EVERY-DEP', mapItemToString(mapItem), 'has no generated content')
			}
		});
	});
}




// Resolve the decl with the computed value
// Also add in any media queries that change the value as necessary
function resolveDecl(decl, map, /*optional*/shouldPreserve, /*optional*/preserveAtRulesOrder, /*optional*/logResolveValueResult) {
	log(chalk.cyan(`\n\n\n--- RESOLVING DECLARATION ${decl.parent.selector}: ${declarationToString(decl)} ---`))
	shouldPreserve = shouldPreserve || false;
	preserveAtRulesOrder = preserveAtRulesOrder || false;

	// Make it chainable
	var _logResolveValueResult = function(valueResults) {
		if(logResolveValueResult) {
			logResolveValueResult(valueResults);
		}

		return valueResults;
	};



	// Grab the balue for this declarations
	//console.log('resolveDecl 1');
	var valueResults = _logResolveValueResult(resolveValue(decl, map));


	// Resolve the cascade dependencies
	// Now find any at-rule declarations that need to be added below each rule
	//console.log('resolveDecl 2');
	var previousAtRuleNode;
	log(chalk.cyan('\n--- DEPENDENCIES @atrules / specific :root ---'))
	eachMapItemDependencyOfDecl(valueResults.variablesUsed, map, decl, function(mimicDecl, mapItem) {
		var ruleClone = shallowCloneNode(decl.parent);
		var declClone = decl.clone();
		// Add the declaration to our new rule
		ruleClone.append(declClone);

		if(shouldPreserve === true) {
			declClone.cloneAfter();
		}

		// No mangle resolve
		declClone.value = _logResolveValueResult(resolveValue(mimicDecl, map, true)).value;

		if(mapItem.isUnderAtRule) {
			// Create the clean atRule for which we place the declaration under
			var atRuleNode = shallowCloneNode(mapItem.parent.parent);

			// Add the rule to the atRule
			atRuleNode.append(ruleClone);

			if (mapItem.isRootSpecific) {
				ruleClone.selector = mergeRootSpecifity(mapItem.parent.selector, ruleClone.selector)
			}

			// Since that atRuleNode can be nested in other atRules, we need to make the appropriate structure
			var parentAtRuleNode = atRuleNode
			var currentAtRuleNode = mapItem.parent.parent
			while (currentAtRuleNode.parent.type === 'atrule') {
				// Create a new clean clone of that at rule to nest under
				var newParentAtRuleNode = shallowCloneNode(currentAtRuleNode.parent);

				// Append the old parent
				newParentAtRuleNode.append(parentAtRuleNode);
				// Then set the new one as the current for next iteration
				parentAtRuleNode = newParentAtRuleNode;

				currentAtRuleNode = currentAtRuleNode.parent;
			}

			// Put the first atRuleStructure after the declaration's rule,
			// and after that, put them right after the previous one
			decl.parent.parent.insertAfter(preserveAtRulesOrder && previousAtRuleNode || decl.parent, parentAtRuleNode);

			// Save referance of previous atRuleStructure
			previousAtRuleNode = parentAtRuleNode
		} else if (mapItem.isRootSpecific) {
			ruleClone.selector = mergeRootSpecifity(mapItem.parent.selector, mimicDecl.parent.selector)

			// Put the first atRuleStructure after the declaration's rule,
			// and after that, put them right after the previous one
			decl.parent.parent.insertAfter(preserveAtRulesOrder && previousAtRuleNode || decl.parent, ruleClone);
		} else {
			ruleClone.selector = mimicDecl.parent.selector;

			// Put the first atRuleStructure after the declaration's rule,
			// and after that, put them right after the previous one
			decl.parent.parent.insertAfter(preserveAtRulesOrder && previousAtRuleNode || decl.parent, ruleClone);
		}
	});


	// If we are preserving var(...) usage and the value changed meaning it had some
	if(shouldPreserve === true && decl.value !== valueResults.value) {
		decl.cloneAfter();
	}


	// Set 'undefined' value as a string to avoid making other plugins down the line unhappy
	// See #22
	if (valueResults.value === undefined) {
		valueResults.value = 'undefined';
	}


	// Set the new value after we are done dealing with at-rule stuff
	decl.value = valueResults.value;
}






module.exports = resolveDecl;
