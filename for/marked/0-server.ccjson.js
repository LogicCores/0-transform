
exports.forLib = function (LIB) {
    var ccjson = this;

    const SERVER = require("./0-server.api");

    return LIB.Promise.resolve({
        forConfig: function (defaultConfig) {

            var Entity = function (instanceConfig) {
                var self = this;
                var config = {};
                LIB._.merge(config, defaultConfig)
                LIB._.merge(config, instanceConfig)

                self.AspectInstance = function (aspectConfig) {

                    return LIB.Promise.resolve({
                        app: function () {

                            return LIB.Promise.resolve(
                                ccjson.makeDetachedFunction(
                                    SERVER.app(config)
                                )
                            );
                        }
                    });
                }
            }
            Entity.prototype.config = defaultConfig;

            return Entity;
        }
    });
}
