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
    // Live preview state for the 5-finger touchpad pinch gesture (see
    // touchpadPinchStep/touchpadPinchEnded below and their registration in init()).
    // touchpadPinchFraction tracks live preview progress towards the "showing
    // desktop" state: 0 = normal windows, 1 = fully off to corners (desktop shown).
    // A new gesture always starts from whatever fraction was last committed or
    // previewed, and is kept in sync with the authoritative showingDesktop state
    // (set elsewhere, in Workspace, based on PinchGesture::triggered()) via
    // setShowingDesktop below.
    touchpadPinchFraction: 0,
    lastTouchpadPinchProgress: 0,
    loadConfig: function () {
        badBadWindowsEffect.duration = animationTime(250);
    },
    setShowingDesktop: function (showing) {
        badBadWindowsEffect.showingDesktop = showing;
        badBadWindowsEffect.touchpadPinchFraction = showing ? 1 : 0;
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

                if (!w.hiddenByShowDesktop) {
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
    // 5-finger touchpad pinch (touchpadPinchStep below).
    previewShowingDesktop: function (fraction) {
        var time = Math.min(1, Math.max(0, fraction)) * badBadWindowsEffect.duration;
        badBadWindowsEffect.offToCorners(true, time);
    },
    // sign is +1 for the Expanding (pinch-out) gesture, which previews towards
    // showing the desktop, and -1 for Contracting (pinch-in), which previews
    // towards restoring the windows. progress is the raw, unclamped value from
    // PinchGesture::progress() for whichever direction is currently active; only
    // its *change* since the last call is meaningful (see ZoomEffect for the same
    // technique), since progress resets whenever GestureRecognizer starts a new
    // PinchGesture instance (e.g. when the active direction flips).
    touchpadPinchStep: function (progress, sign) {
        var clamped = Math.min(1, progress);
        var delta = clamped - badBadWindowsEffect.lastTouchpadPinchProgress;
        badBadWindowsEffect.lastTouchpadPinchProgress = clamped;
        badBadWindowsEffect.touchpadPinchFraction = Math.min(1, Math.max(0,
            badBadWindowsEffect.touchpadPinchFraction + sign * delta));
        badBadWindowsEffect.previewShowingDesktop(badBadWindowsEffect.touchpadPinchFraction);
    },
    touchpadPinchEnded: function () {
        badBadWindowsEffect.lastTouchpadPinchProgress = 0;
        // The actual Show Desktop state commit is decided independently, in
        // Workspace (KWin core), based on PinchGesture::triggered(); this just
        // resettles our live preview to whatever that authoritative state ends
        // up being (kept up to date via setShowingDesktop/showingDesktopChanged).
        badBadWindowsEffect.previewShowingDesktop(badBadWindowsEffect.showingDesktop ? 1 : 0);
    },
    init: function () {
        badBadWindowsEffect.loadConfig();
        effects.showingDesktopChanged.connect(badBadWindowsEffect.setShowingDesktop);
        effects.showingDesktopChanged.connect(badBadWindowsEffect.offToCorners);
        effect.animationEnded.connect(badBadWindowsEffect.animationEnded);

        // KWin::PinchDirection: 0 = Expanding, 1 = Contracting
        registerTouchpadPinchGesture(0, 5,
            function (progress) { badBadWindowsEffect.touchpadPinchStep(progress, 1); },
            badBadWindowsEffect.touchpadPinchEnded);
        registerTouchpadPinchGesture(1, 5,
            function (progress) { badBadWindowsEffect.touchpadPinchStep(progress, -1); },
            badBadWindowsEffect.touchpadPinchEnded);

        let edges = effect.touchEdgesForAction("show-desktop");

        for (let i in edges) {
            let edge = parseInt(edges[i]);
            registerRealtimeScreenEdge(edge, badBadWindowsEffect.realtimeScreenEdgeCallback);
        }
    }
};

badBadWindowsEffect.init();
