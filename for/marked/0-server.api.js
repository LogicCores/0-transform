
const PATH = require("path");
const FS = require("fs");
const MARKED = require('marked');
const HIGHLIGHT = require("highlight.js");


exports.app = function (options) {

    return function (req, res, next) {

        var uri = req.params[0];

        var path = PATH.join(options.basePath, uri);

        // TODO: Allow various ways to request format. e.g. via accept request header.
        var requestedFormat = (/\.htm$/.test(path) && 'htm') || null;
        if (requestedFormat) {
            path = path.replace(/\.htm$/, "");
        }

        return FS.exists(path, function (exists) {
            if (!exists) {
                var err = new Error("File '" + path + "' not found!");
                err.code = 404;
                return next(err);
            }
            
            return FS.readFile(path, "utf8", function (err, markdown) {
                if (err) return next(err);
                
                if (requestedFormat) {

                    return MARKED(markdown, {
                        highlight: function (code) {
                            return HIGHLIGHT.highlightAuto(code).value;
                        }
                    }, function (err, html) {
                        if (err) return next(err);

                		res.writeHead(200, {
                			"Content-Type": "text/html"
                		});
                		return res.end(html);
                    });
                } else {

            		res.writeHead(200, {
            			"Content-Type": "text/x-markdown; charset=UTF-8"
            		});
            		return res.end(markdown);
                }
            });
        });
    };
}

