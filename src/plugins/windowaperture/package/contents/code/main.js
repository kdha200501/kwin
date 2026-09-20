/*
    KWin - the KDE window manager
    This file is part of the KDE project.

    SPDX-FileCopyrightText: 2015 Thomas Lübking <thomas.luebking@gmail.com>

    SPDX-License-Identifier: GPL-2.0-or-later
*/
/*global effect, effects, animate, animationTime, Effect, QEasingCurve */

"use strict";

var badBadWindowsEffect = {
    duration: animationTime(250),
    showingDesktop: false,
    loadConfig: function () {
        badBadWindowsEffect.duration = animationTime(250);
    },
    setShowingDesktop: function (showing) {
        badBadWindowsEffect.showingDesktop = showing;
    },
    offToCorners: function (showing, frozenTime) {
        if (typeof frozenTime === "undefined") {
            frozenTime = -1;
        }
        var stackingOrder = effects.stackingOrder;
        var screenGeo = effects.virtualScreenGeometry;
        var xOffset = screenGeo.width / 16;
        var yOffset = screenGeo.height / 16;
        if (showing) {
            var closestWindows = [ undefined, undefined, undefined, undefined ];
            var movedWindowsCount = 0;
            for (var i = 0; i < stackingOrder.length; ++i) {
                var w = stackingOrder[i];

                // A window is a participant if it would be shown away when the
                // desktop is shown. Use breaksShowingDesktop (the same predicate
                // the core uses to decide which windows get hidden) rather than
                // hiddenByShowDesktop: the latter is only set once the boolean
                // "showing desktop" state is committed, so gating on it would
                // skip every window during a live gesture-driven preview, and
                // the animation would only begin at the end of the gesture.
                if (!w.breaksShowingDesktop) {
                    continue;
                }

                // ignore invisible windows and such that do not have to be restored
                if (!w.visible) {
                    if (w.offToCornerId) {
                        // if it was visible when the effect was activated delete its animation data
                        cancel(w.offToCornerId);
                        delete w.offToCornerId;
                        delete w.apertureCorner;
                    }
                    continue;
                }

                // Don't touch docks
                if (w.dock) {
                    continue;
                }

                // calculate the corner distances
                var geo = w.geometry;
                var dl = geo.x + geo.width - screenGeo.x;
                var dr = screenGeo.x + screenGeo.width - geo.x;
                var dt = geo.y + geo.height - screenGeo.y;
                var db = screenGeo.y + screenGeo.height - geo.y;
                w.apertureDistances = [ dl + dt, dr + dt, dr + db, dl + db ];
                movedWindowsCount += 1;

                // if this window is the closest one to any corner, set it as preferred there
                var nearest = 0;
                for (var j = 1; j < 4; ++j) {
                    if (w.apertureDistances[j] < w.apertureDistances[nearest] ||
                        (w.apertureDistances[j] == w.apertureDistances[nearest] && closestWindows[j] === undefined)) {
                        nearest = j;
                    }
                }
                if (closestWindows[nearest] === undefined ||
                    closestWindows[nearest].apertureDistances[nearest] > w.apertureDistances[nearest])
                    closestWindows[nearest] = w;
            }

            // second pass, select corners

            // 1st off, move the nearest windows to their nearest corners
            // this will ensure that if there's only on window in the lower right
            // it won't be moved out to the upper left
            var movedWindowsDec = [ 0, 0, 0, 0 ];
            for (var i = 0; i < 4; ++i) {
                if (closestWindows[i] === undefined)
                    continue;
                closestWindows[i].apertureCorner = i;
                delete closestWindows[i].apertureDistances;
                movedWindowsDec[i] = 1;
            }

            // 2nd, distribute the remainders according to their preferences
            // this doesn't exactly have heapsort performance ;-)
            movedWindowsCount = Math.floor((movedWindowsCount + 3) / 4);
            for (var i = 0; i < 4; ++i) {
                for (var j = 0; j < movedWindowsCount - movedWindowsDec[i]; ++j) {
                    var bestWindow = undefined;
                    for (var k = 0; k < stackingOrder.length; ++k) {
                        if (stackingOrder[k].apertureDistances === undefined)
                            continue;
                        if (bestWindow === undefined ||
                            stackingOrder[k].apertureDistances[i] < bestWindow.apertureDistances[i])
                            bestWindow = stackingOrder[k];
                    }
                    if (bestWindow === undefined)
                        break;
                    bestWindow.apertureCorner = i;
                    delete bestWindow.apertureDistances;
                }
            }

        }

        // actually re/move windows from/to assigned corners
        for (var i = 0; i < stackingOrder.length; ++i) {
            var w = stackingOrder[i];
            if (w.apertureCorner === undefined && w.offToCornerId === undefined)
                continue;

            if (w.dock) {
                continue;
            }

            var anchor, tx, ty;
            var geo = w.geometry;
            if (w.apertureCorner == 1 || w.apertureCorner == 2) {
                tx = screenGeo.x + screenGeo.width - xOffset;
                anchor = Effect.Left;
            } else {
                tx = xOffset;
                anchor = Effect.Right;
            }
            if (w.apertureCorner > 1) {
                ty = screenGeo.y + screenGeo.height - yOffset;
                anchor |= Effect.Top;
            } else {
                ty = yOffset;
                anchor |= Effect.Bottom;
            }

            if (showing) {
                if (!w.offToCornerId || !freezeInTime(w.offToCornerId, frozenTime)) {

                    w.offToCornerId = set({
                        window: w,
                        duration: badBadWindowsEffect.duration,
                        curve: QEasingCurve.InOutCubic,
                        animations: [{
                            type: Effect.Position,
                            targetAnchor: anchor,
                            to: { value1: tx, value2: ty },
                            frozenTime: frozenTime
                        },{
                            type: Effect.Opacity,
                            to: 0.0,
                            frozenTime: frozenTime
                        }]
                    });
                } else {
                    // freezeInTime() only pokes the existing animation's internal
                    // elapsed time; unlike set()/animate() it does not itself
                    // schedule a repaint. If this animation had already gone idle
                    // (e.g. a previous gesture ran it to completion and the
                    // compositor stopped repainting it), reusing it here would
                    // otherwise update its state invisibly until some unrelated
                    // event forces a repaint, making the window jump straight to
                    // its new position instead of animating. Explicitly request a
                    // repaint so every scrubbed frame is actually painted.
                    effects.addRepaintFull();
                }
            } else {
                // Reset if the window has become invisible in the meantime
                if (!w.visible) {
                    cancel(w.offToCornerId);
                    delete w.offToCornerId;
                    delete w.apertureCorner;
                // This if the window was invisible and has become visible in the meantime
                } else if (!w.offToCornerId || !redirect(w.offToCornerId, Effect.Backward) || !freezeInTime(w.offToCornerId, frozenTime)) {
                    animate({
                        window: w,
                        duration: badBadWindowsEffect.duration,
                        curve: QEasingCurve.InOutCubic,
                        animations: [{
                            type: Effect.Position,
                            sourceAnchor: anchor,
                            gesture: true,
                            from: { value1: tx, value2: ty }
                        },{
                            type: Effect.Opacity,
                            from: 0.0
                        }]
                    });
                } else {
                    // Same reasoning as above: redirect()/freezeInTime() reused an
                    // existing (possibly idle) animation without scheduling a
                    // repaint, so force one.
                    effects.addRepaintFull();
                }
            }
        }
    },
    animationEnded: function (w, a, meta) {
        // After the animation that closes the effect, reset all the parameters
        if (!badBadWindowsEffect.showingDesktop) {
            cancel(w.offToCornerId);
            delete w.offToCornerId;
            delete w.apertureCorner;
        }
    },
    realtimeScreenEdgeCallback: function (border, deltaProgress, effectScreen) {
        if (!deltaProgress || !effectScreen) {
            badBadWindowsEffect.offToCorners(badBadWindowsEffect.showingDesktop, -1);
            return;
        }
        let time = 0;

        switch (border) {
        case KWin.ElectricTop:
        case KWin.ElectricBottom:
            time = Math.min(1, (Math.abs(deltaProgress.height) / (effectScreen.geometry.height / 2))) * badBadWindowsEffect.duration;
            break;
        case KWin.ElectricLeft:
        case KWin.ElectricRight:
            time = Math.min(1, (Math.abs(deltaProgress.width) / (effectScreen.geometry.width / 2))) * badBadWindowsEffect.duration;
            break;
        default:
            return;
        }
        if (badBadWindowsEffect.showingDesktop) {
            time = badBadWindowsEffect.duration - time;
        }

        badBadWindowsEffect.offToCorners(true, time)
    },
    // Preview the "showing desktop" transition frozen at a given fraction
    // (0.0 = normal windows, 1.0 = fully off to corners/desktop shown), used by
    // both the touch-edge drag (realtimeScreenEdgeCallback above) and the
    // 5-finger touchpad pinch, driven directly off Workspace::showingDesktopFactor
    // via effects.showingDesktopFactorChanged (see init() below) - the core is the
    // single source of truth for that fraction, so there is no JS-local state to
    // keep in sync here any more.
    previewShowingDesktop: function (fraction) {
        var time = Math.min(1, Math.max(0, fraction)) * badBadWindowsEffect.duration;
        badBadWindowsEffect.offToCorners(true, time);
    },
    // Called whenever a gesture driving the live preview above ends (completed
    // or cancelled), even if it didn't actually flip the showingDesktop state
    // (e.g. it was aborted before crossing the halfway point, un-doing back to
    // where it started). offToCorners(showing, -1) unfreezes whichever
    // animation the live scrub left in place and lets it play out for real
    // (in real time, from wherever it currently is) towards its target,
    // instead of leaving it frozen mid-way with no further motion.
    settleShowingDesktop: function (showing) {
        badBadWindowsEffect.offToCorners(showing, -1);
    },
    init: function () {
        badBadWindowsEffect.loadConfig();
        effect.configChanged.connect(badBadWindowsEffect.loadConfig);
        effects.showingDesktopChanged.connect(badBadWindowsEffect.setShowingDesktop);
        effects.showingDesktopChanged.connect(badBadWindowsEffect.offToCorners);
        effects.showingDesktopFactorChanged.connect(badBadWindowsEffect.previewShowingDesktop);
        effects.showingDesktopFactorSettled.connect(badBadWindowsEffect.settleShowingDesktop);
        effect.animationEnded.connect(badBadWindowsEffect.animationEnded);

        let edges = effect.touchEdgesForAction("show-desktop");

        for (let i in edges) {
            let edge = parseInt(edges[i]);
            registerRealtimeScreenEdge(edge, badBadWindowsEffect.realtimeScreenEdgeCallback);
        }
    }
};

badBadWindowsEffect.init();
