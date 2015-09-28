
const PATH = require("path");
const FS = require("fs");
const URL = require("url");
const MARKED = require('../../../../lib/marked');
const HIGHLIGHT = require("highlight.js");


exports.forLib = function (LIB) {
    
    var exports = {};

    exports.app = function (options) {
        
        var context = options.context();

        return function (req, res, next) {
            
            return context.getAdapterAPI("page").then(function (page) {
                    
                function uriToPath (uri, requestedFormat) {
                    if (!options.usePageContext) {
                        if (requestedFormat) {
                            uri = uri.replace(/\.htm$/, "");
                        }
                        return LIB.Promise.resolve(PATH.join(options.basePath, uri));
                    }
                    return page.contextForUri(uri).then(function (pageContext) {
                        return pageContext.page.data.realpath;
                    });
                }
                
                function postprocess (uri, format, data) {
                    if (
                        !options.postprocess ||
                        !options.postprocess.htm
                    ) {
                        return LIB.Promise.resolve(data);
                    }
                    var done = LIB.Promise.resolve();
                    done = done.then(function () {
                        return LIB.Promise.try(function () {
                            if (options.postprocess.htm) {
                                return page.contextForUri(uri).then(function (pageContext) {
                                    // TODO: Relocate to page helper and register as postprocessor so it
                                    //       gets called above.
                                    // Re-base all style and script paths.
                                    var re = /(<script.+?src="|<link.+?href="|<a.+?href=")\//g;
                                    var m = null;
                                    var replace = {};
                                    while ( (m = re.exec(data)) ) {
                                        replace[m[1]] = m;
                                    }
                                    var baseSubPath = URL.parse(pageContext.page.host.baseUrl).pathname;
                                    if (!/\/$/.test(baseSubPath)) baseSubPath += "/";
                                    Object.keys(replace).forEach(function (key) {
                                        data = data.replace(
                                            new RegExp(LIB.RegExp_Escape(replace[key][0]), "g"),
                                            replace[key][1] + baseSubPath
                                        );
                                    });
                                });
                            }
                        });
                    });
                    Object.keys(options.postprocess.htm).forEach(function (alias) {
                        done = done.then(function () {
    
                            if (
                                // TODO: Add accept request header to bypass vdom compilation if not requested.
                                //       We force no-compile for some URIs to maintain working test cases
                                //       for bare-bones DOM-based component lifting code.
                                alias === "vdom-compile" && 
                                uri === "/Tests/Component/MarkdownInheritedFirewidget-DOM.md.htm"
                            ) return;
    
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

                                // Remove all double newlines between HTML tags
                                var inMarkup = false;
                                var lines = [];
                                markdown.split("\n").forEach(function (line) {
//console.log(inMarkup, "line >>", line, "<<")
                                    if (/^</.test(line)) {
                                        inMarkup = !inMarkup;
                                        lines.push(line);
                                    } else
                                    if (
                                        inMarkup &&
                                        /^\s*$/.test(line)
                                    ) {
                                        // ignore
                                    } else {
                                        lines.push(line);
                                    }
                                });
                                markdown = lines.join("\n");

//console.log("IN >>>", markdown, "<<<");    

                                return MARKED(markdown, {
                                    rawHtml: true,
                                    highlight: function (code) {
                                        return HIGHLIGHT.highlightAuto(code).value;
                                    }
                                }, function (err, html) {
                                    if (err) return next(err);
//console.log("html", html);    
                                    // We wrap the html to ensure we have only one top-level element.
                                    html = '<div>' + html + '</div>';
                                    //html = '<div data-container="component-parts">' + html + '</div>';
    
                                    return postprocess(uri, "htm", html).then(function (html) {
    
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
                });
            }).catch(next);
        };
    }

    return exports;
}
