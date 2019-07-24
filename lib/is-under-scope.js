var escapeStringRegexp = require('escape-string-regexp');

var isPieceAlwaysAncestorSelector = require('./is-piece-always-ancestor-selector');
var generateDirectDescendantPiecesFromSelector = require('./generate-direct-descendant-pieces-from-selector');
var isPieceRootSpecificSelector = require('./is-piece-root-specific-selector')

const chalk = require('chalk')
const { logDepth } = require('./logging')
const stripPseudoSelectors = require('./strip-pseudo-selectors')

var RE_AT_RULE_SCOPE_PIECE  = (/^@.*/);

function getScopeMatchResults(nodeScopeList, scopeNodeScopeList, depth = 0) {
	const log = logDepth(depth, chalk.red('scope'))

	var currentPieceOffset;
	var scopePieceIndex;

	// Check each comma separated piece of the complex selector
	var doesMatchScope = scopeNodeScopeList.some(function(scopeNodeScopePieces) {
		return nodeScopeList.some(function(nodeScopePieces) {

			log('np', nodeScopePieces, 'sp', scopeNodeScopePieces);

			currentPieceOffset = null;
			var wasEveryPieceFound = true;
			for(scopePieceIndex = 0; scopePieceIndex < scopeNodeScopePieces.length; scopePieceIndex++) {
				var scopePiece = scopeNodeScopePieces[scopePieceIndex];
				var pieceOffset = currentPieceOffset || 0;

				var foundIndex = -1;
				// Look through the remaining pieces(start from the offset)
				var piecesWeCanMatch = nodeScopePieces.slice(pieceOffset);
				for(var nodeScopePieceIndex = 0; nodeScopePieceIndex < piecesWeCanMatch.length; nodeScopePieceIndex++) {
					var nodeScopePiece = piecesWeCanMatch[nodeScopePieceIndex];
					var overallIndex = pieceOffset + nodeScopePieceIndex;

					log(nodeScopePiece, scopePiece)
					// Find the scope piece at the end of the node selector
					// Last-occurence
					if(
						// If the part on the end of the piece itself matches:
						//		scopePiece `.bar` matches node `.bar`
						//		scopePiece `.bar` matches node `.foo + .bar`
						new RegExp(escapeStringRegexp(scopePiece) + '$').test(nodeScopePiece)
					) {
						log('last occurence')
						foundIndex = overallIndex;
						break;
					}


					// If the scope piece is a always-ancestor, then it is valid no matter what
					//
					// Or the node scope piece could be an always-ancestor selector itself
					// And we only want the first occurence so we can keep matching future scope pieces
					if(
						!isPieceRootSpecificSelector(scopePiece) && !isPieceRootSpecificSelector(nodeScopePiece) && (
							isPieceAlwaysAncestorSelector(scopePiece) ||
							isPieceAlwaysAncestorSelector(nodeScopePiece)
						)
					) {
						foundIndex = overallIndex;

						break;
					}


					// Handle any direct descendant operators in each piece
					var directDescendantPieces = generateDirectDescendantPiecesFromSelector(nodeScopePiece);
					// Only try to work out direct descendants if there was the `>` combinator, meaning multiple pieces
					if(directDescendantPieces.length > 1) {

						var ddNodeScopeList = [].concat([directDescendantPieces]);
						// Massage into a direct descendant separated list
						var ddScopeList = [].concat([
							scopeNodeScopePieces
								.slice(scopePieceIndex)
								.reduce(function(prevScopePieces, scopePiece) {
									return prevScopePieces.concat(generateDirectDescendantPiecesFromSelector(scopePiece));
								}, [])
						]);
						var result = getScopeMatchResults(ddNodeScopeList, ddScopeList, depth + 1);

						// If it matches completely
						// or there are still more pieces to match in the future
						if(result.doesMatchScope || scopePieceIndex + 1 < scopeNodeScopePieces.length) {
							foundIndex = overallIndex;
							// Move the scope forward the amount that piece consumed
							// -1 because the of for-loop increments at each iteration
							scopePieceIndex += result.scopePieceIndex - 1;
						}

						break;
					}
				}


				var isFurther = foundIndex >= pieceOffset;

				currentPieceOffset = foundIndex + 1;

				// Mimicing a `[].every` with a for-loop
				wasEveryPieceFound = wasEveryPieceFound && isFurther;
				if(!wasEveryPieceFound) {
					break;
				}
			}

			return wasEveryPieceFound;
		});
	});

	return {
		doesMatchScope: doesMatchScope,
		nodeScopePieceIndex: currentPieceOffset - 1,
		scopePieceIndex: scopePieceIndex
	};
}



var stripPseudoSelectorsFromScopeList = function(scopeList) {
	return scopeList.map(function(scopePieces) {
		return scopePieces.map(function(descendantPiece) {
				// If not an at-rule piece, remove the pseudo selector part `@media (max-width: 300px)`
				if(!RE_AT_RULE_SCOPE_PIECE.test(descendantPiece)) {
					return stripPseudoSelectors(descendantPiece)
				}
				return descendantPiece;
			});
	});
};


// Given the nodes scope, and the target scope,
// Is the node in the same or under the target scope (cascade wise)
//
// Another way to think about it: Can the target scope cascade properties to the node?
//
// For scope-lists see: `generateScopeList`
var isUnderScope = function(nodeScopeList, scopeNodeScopeList, /*optional*/ignorePseudo, /*optional*/ depth = 0) {
	// Because we only care about the scopeNodeScope matching to the nodeScope
	// Remove the pseudo selectors from the nodeScope so it can match a broader version
	// ex. `.foo:hover` can resolve variables from `.foo`
	nodeScopeList = stripPseudoSelectorsFromScopeList(nodeScopeList);

	if(ignorePseudo) {
		scopeNodeScopeList = stripPseudoSelectorsFromScopeList(scopeNodeScopeList);
	}

	return getScopeMatchResults(nodeScopeList, scopeNodeScopeList, depth).doesMatchScope;
};

module.exports = isUnderScope;
