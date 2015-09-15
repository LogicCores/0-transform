
const PATH = require("path");
const FS = require("fs");
const MARKED = require('marked');
const HIGHLIGHT = require("highlight.js");


exports.forLib = function (LIB) {
    
    var exports = {};

    exports.app = function (options) {

        return function (req, res, next) {

            function uriToPath (uri, requestedFormat) {
                if (!options.usePageContext) {
                    if (requestedFormat) {
                        uri = uri.replace(/\.htm$/, "");
                    }
                    return LIB.Promise.resolve(PATH.join(options.basePath, uri));
                }
                return req.context.page.contextForUri(uri).then(function (pageContext) {
                    return pageContext.page.data.realpath;
                });
            }
            
            function postprocess (format, data) {
                if (
                    !options.postprocess ||
                    !options.postprocess.htm
                ) {
                    return LIB.Promise.resolve(data);
                }
                var done = LIB.Promise.resolve();
                Object.keys(options.postprocess.htm).forEach(function (alias) {
                    done = done.then(function () {
                        return options.postprocess.htm[alias](data).then(function (_data) {
                            data = _data
                        });
                    });
                });
                return done.then(function () {
                    return data;
                });
            }

            var uri = req.params[0];

            // TODO: Allow various ways to request format. e.g. via accept request header.
            var requestedFormat = (/\.htm$/.test(uri) && 'htm') || null;

            return uriToPath(uri, requestedFormat).then(function (path) {

                return FS.exists(path, function (exists) {
                    if (!exists) {
                        var err = new Error("File '" + path + "' not found!");
                        err.code = 404;
                        return next(err);
                    }
                    
                    return FS.readFile(path, "utf8", function (err, markdown) {
                        if (err) return next(err);
                        
                        if (requestedFormat === "htm") {
        
                            return MARKED(markdown, {
                                highlight: function (code) {
                                    return HIGHLIGHT.highlightAuto(code).value;
                                }
                            }, function (err, html) {
                                if (err) return next(err);

                                return postprocess("htm", html).then(function (html) {

                            		res.writeHead(200, {
                            			"Content-Type": "text/html"
                            		});
                            		return res.end(html);
                                });
                            });
                        } else {

                            return postprocess("md", markdown).then(function (markdown) {

                        		res.writeHead(200, {
                        			"Content-Type": "text/x-markdown; charset=UTF-8"
                        		});
                        		return res.end(markdown);
                            });
                        }
                    });
                });
            }).catch(next);
        };
    }

    return exports;
}
