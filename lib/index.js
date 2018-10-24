'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _values = require('babel-runtime/core-js/object/values');

var _values2 = _interopRequireDefault(_values);

var _entries = require('babel-runtime/core-js/object/entries');

var _entries2 = _interopRequireDefault(_entries);

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _slicedToArray2 = require('babel-runtime/helpers/slicedToArray');

var _slicedToArray3 = _interopRequireDefault(_slicedToArray2);

var _keys = require('babel-runtime/core-js/object/keys');

var _keys2 = _interopRequireDefault(_keys);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _readPkgUp = require('read-pkg-up');

var _readPkgUp2 = _interopRequireDefault(_readPkgUp);

var _htmlWebpackIncludeAssetsPlugin = require('html-webpack-include-assets-plugin');

var _htmlWebpackIncludeAssetsPlugin2 = _interopRequireDefault(_htmlWebpackIncludeAssetsPlugin);

var _ExternalModule = require('webpack/lib/ExternalModule');

var _ExternalModule2 = _interopRequireDefault(_ExternalModule);

var _resolvePkg = require('resolve-pkg');

var _resolvePkg2 = _interopRequireDefault(_resolvePkg);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const pluginName = 'jsdelivr-cdn-webpack-plugin';
let HtmlWebpackPlugin;
try {
    // eslint-disable-next-line import/no-extraneous-dependencies
    HtmlWebpackPlugin = require('html-webpack-plugin');
} catch (err) {
    HtmlWebpackPlugin = null;
}

const moduleRegex = /^((?:@[a-z0-9][\w-.]+\/)?[a-z0-9][\w-.]*)/;

const getEnvironment = mode => {
    switch (mode) {
        case 'none':
        case 'development':
            return 'development';

        default:
            return 'production';
    }
};

class JSDelivrCdnWebpackPlugin {
    constructor({ disable = false, env, include, verbose, resolver } = {}) {

        this.disable = disable;
        this.env = env;
        this.include = include || [];
        this.verbose = verbose === true;
        this.resolver = (moduleName, version, options = {}) => {
            const min = options.env === 'production' ? '.min' : '';
            return {
                name: moduleName,
                var: null,
                url: `https://cdn.jsdelivr.net/npm/${moduleName}@${version}/${moduleName}${min}.js`,
                version
            };
        };

        getResolver(resolver);

        this.modulesFromCdn = {};
    }

    apply(compiler) {
        if (!this.disable) {
            this.execute(compiler, { env: this.env || getEnvironment(compiler.options.mode) });
        }

        const isUsingHtmlWebpackPlugin = HtmlWebpackPlugin != null && compiler.options.plugins.some(x => x instanceof HtmlWebpackPlugin);

        if (isUsingHtmlWebpackPlugin) {
            this.applyHtmlWebpackPlugin(compiler);
        } else {
            this.applyWebpackCore(compiler);
        }
    }

    execute(compiler, { env }) {
        var _this = this;

        compiler.hooks.normalModuleFactory.tap(pluginName, nmf => {
            nmf.hooks.factory.tap(pluginName, factory => (() => {
                var _ref = (0, _asyncToGenerator3.default)(function* (data, cb) {
                    const modulePath = data.dependencies[0].request;
                    const contextPath = data.context;

                    const isModulePath = moduleRegex.test(modulePath);
                    if (!isModulePath) {
                        return factory(data, cb);
                    }

                    const varName = yield _this.addModule(contextPath, modulePath, { env });

                    if (varName === false) {
                        factory(data, cb);
                    } else if (varName == null) {
                        cb(null);
                    } else {
                        cb(null, new _ExternalModule2.default(varName, 'var', modulePath));
                    }
                });

                return function (_x, _x2) {
                    return _ref.apply(this, arguments);
                };
            })());
        });
    }

    addModule(contextPath, modulePath, { env }) {
        var _this2 = this;

        return (0, _asyncToGenerator3.default)(function* () {
            if (!(modulePath in _this2.include)) {
                return false;
            }

            const moduleName = modulePath.match(moduleRegex)[1];

            var _ref2 = yield (0, _readPkgUp2.default)({ cwd: (0, _resolvePkg2.default)(moduleName, { cwd: contextPath }) }),
                _ref2$pkg = _ref2.pkg;

            const version = _ref2$pkg.version,
                  peerDependencies = _ref2$pkg.peerDependencies;


            const isModuleAlreadyLoaded = Boolean(_this2.modulesFromCdn[modulePath]);
            if (isModuleAlreadyLoaded) {
                const isSameVersion = _this2.modulesFromCdn[modulePath].version === version;
                if (isSameVersion) {
                    return _this2.modulesFromCdn[modulePath].var;
                }

                return false;
            }

            const cdnConfig = yield _this2.resolver(modulePath, version, { env });

            if (cdnConfig == null) {
                if (_this2.verbose) {
                    console.log(`❌ '${modulePath}' couldn't be found`);
                }
                return false;
            }

            if (_this2.verbose) {
                console.log(`✔️ '${cdnConfig.name}' will be served by ${cdnConfig.url}`);
            }

            if (peerDependencies) {
                const arePeerDependenciesLoaded = (yield _promise2.default.all((0, _keys2.default)(peerDependencies).map(function (peerDependencyName) {
                    return _this2.addModule(contextPath, peerDependencyName, { env });
                }))).map(function (x) {
                    return Boolean(x);
                }).reduce(function (result, x) {
                    return result && x;
                }, true);

                if (!arePeerDependenciesLoaded) {
                    return false;
                }
            }

            _this2.modulesFromCdn[modulePath] = cdnConfig;

            return cdnConfig.var;
        })();
    }

    applyWebpackCore(compiler) {
        compiler.hooks.afterCompile.tapAsync(pluginName, (compilation, cb) => {
            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = (0, _getIterator3.default)((0, _entries2.default)(this.modulesFromCdn)), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    const _ref3 = _step.value;

                    var _ref4 = (0, _slicedToArray3.default)(_ref3, 2);

                    const name = _ref4[0];
                    const cdnConfig = _ref4[1];

                    compilation.addChunkInGroup(name);
                    const chunk = compilation.addChunk(name);
                    chunk.files.push(cdnConfig.url);
                }
            } catch (err) {
                _didIteratorError = true;
                _iteratorError = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion && _iterator.return) {
                        _iterator.return();
                    }
                } finally {
                    if (_didIteratorError) {
                        throw _iteratorError;
                    }
                }
            }

            cb();
        });
    }

    applyHtmlWebpackPlugin(compiler) {
        const includeAssetsPlugin = new _htmlWebpackIncludeAssetsPlugin2.default({
            assets: [],
            publicPath: '',
            append: false
        });

        includeAssetsPlugin.apply(compiler);

        compiler.hooks.afterCompile.tapAsync(pluginName, (compilation, cb) => {
            const assets = (0, _values2.default)(this.modulesFromCdn).map(moduleFromCdn => moduleFromCdn.url);

            // HACK: Calling the constructor directly is not recomended
            //       But that's the only secure way to edit `assets` afterhand
            includeAssetsPlugin.constructor({
                assets,
                publicPath: '',
                append: false
            });

            cb();
        });
    }
}
exports.default = JSDelivrCdnWebpackPlugin;