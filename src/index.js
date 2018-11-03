import readPkgUp from 'read-pkg-up';
import HtmlWebpackIncludeAssetsPlugin from 'html-webpack-include-assets-plugin';
import ExternalModule from 'webpack/lib/ExternalModule';
import resolvePkg from 'resolve-pkg';

const pluginName = 'jsdelivr-cdn-webpack-plugin';
const moduleRegex = /^((?:@[a-z0-9][\w-.]+\/)?[a-z0-9][\w-.]*)/;

const defaultResolver = (moduleName, version, options = {}) => {
  const min = options.env === 'production' ? '.min' : '';
  return {
    name: moduleName,
    var: null,
    url: `https://cdn.jsdelivr.net/npm/${moduleName}@${version}/${moduleName}${min}.js`,
    version,
  };
};

class JSDelivrCdnWebpackPlugin {
  constructor({
    disable = false,
    env,
    include,
    verbose,
    resolver = defaultResolver,
  } = {}) {
    this.disable = disable;
    this.env = env;
    this.include = include || [];
    this.verbose = verbose === true;
    this.resolver = resolver;

    this.modulesFromCdn = {};
  }

  apply(compiler) {
    if (!this.disable) {
      const envMappings = {
        none: 'development',
        development: 'development',
      };
      const env =
        this.env || envMappings[compiler.options.mode] || 'production';

      this.execute(compiler, { env });
    }

    const isHtmlWebpackPlugin = x =>
      x.constructor && x.constructor.name === 'HtmlWebpackPlugin';
    const isUsingHtmlWebpackPlugin = compiler.options.plugins.some(
      isHtmlWebpackPlugin,
    );

    if (isUsingHtmlWebpackPlugin) {
      this.applyHtmlWebpackPlugin(compiler);
    } else {
      this.applyWebpackCore(compiler);
    }
  }

  applyWebpackCore(compiler) {
    compiler.hooks.afterCompile.tapAsync(pluginName, (compilation, cb) => {
      for (const [name, cdnConfig] of Object.entries(this.modulesFromCdn)) {
        compilation.addChunkInGroup(name);
        const chunk = compilation.addChunk(name);
        chunk.files.push(cdnConfig.url);
      }

      cb();
    });
  }

  applyHtmlWebpackPlugin(compiler) {
    const includeAssetsPlugin = new HtmlWebpackIncludeAssetsPlugin({
      assets: [],
      publicPath: '',
      append: false,
    });

    includeAssetsPlugin.apply(compiler);

    compiler.hooks.afterCompile.tapAsync(pluginName, (compilation, cb) => {
      // HACK: Calling the constructor directly is not recomended, but that's the only
      // secure way to edit `assets` afterhand
      includeAssetsPlugin.constructor({
        assets: Object.values(this.modulesFromCdn).map(
          moduleFromCdn => moduleFromCdn.url,
        ),
        publicPath: '',
        append: false,
      });

      cb();
    });
  }

  execute(compiler, { env }) {
    compiler.hooks.normalModuleFactory.tap(pluginName, nmf => {
      nmf.hooks.factory.tap(pluginName, factory => async (data, cb) => {
        const modulePath = data.dependencies[0].request;
        const contextPath = data.context;

        const isModulePath = moduleRegex.test(modulePath);
        if (!isModulePath) {
          return factory(data, cb);
        }

        const varName = await this.addModule(contextPath, modulePath, {
          env,
        });

        if (varName === false) {
          factory(data, cb);
        } else if (varName == null) {
          cb(null);
        } else {
          cb(null, new ExternalModule(varName, 'var', modulePath));
        }
      });
    });
  }

  async addModule(contextPath, modulePath, { env }) {
    if (!this.include.includes(modulePath)) {
      return false;
    }

    const moduleName = modulePath.match(moduleRegex)[1];

    const {
      pkg: { version, peerDependencies },
    } = await readPkgUp({
      cwd: resolvePkg(moduleName, { cwd: contextPath }),
    });

    const isModuleAlreadyLoaded = Boolean(this.modulesFromCdn[modulePath]);
    if (isModuleAlreadyLoaded) {
      const isSameVersion = this.modulesFromCdn[modulePath].version === version;
      if (isSameVersion) {
        return this.modulesFromCdn[modulePath].var;
      }

      return false;
    }

    const cdnConfig = await this.resolver(modulePath, version, { env });

    if (cdnConfig == null) {
      if (this.verbose) {
        console.log(`❌ '${modulePath}' couldn't be found`);
      }
      return false;
    }

    if (this.verbose) {
      console.log(`✔️ '${cdnConfig.name}' will be served by ${cdnConfig.url}`);
    }

    if (peerDependencies) {
      const arePeerDependenciesLoaded = (await Promise.all(
        Object.keys(peerDependencies).map(peerDependencyName =>
          this.addModule(contextPath, peerDependencyName, { env }),
        ),
      ))
        .map(x => Boolean(x))
        .reduce((result, x) => result && x, true);

      if (!arePeerDependenciesLoaded) {
        return false;
      }
    }

    this.modulesFromCdn[modulePath] = cdnConfig;

    return cdnConfig.var;
  }
}

export default JSDelivrCdnWebpackPlugin;
