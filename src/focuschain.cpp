/*
    KWin - the KDE window manager
    This file is part of the KDE project.

    SPDX-FileCopyrightText: 2012 Martin Gräßlin <mgraesslin@kde.org>

    SPDX-License-Identifier: GPL-2.0-or-later
*/
#include "focuschain.h"
#include "virtualdesktops.h"
#include "window.h"
#include "workspace.h"

#include <unistd.h>

namespace KWin
{

void FocusChain::remove(Window *window)
{
    for (auto it = m_desktopFocusChains.begin();
         it != m_desktopFocusChains.end();
         ++it) {
        it.value().removeAll(window);
    }
    m_mostRecentlyUsed.removeAll(window);
}

void FocusChain::addDesktop(VirtualDesktop *desktop)
{
    m_desktopFocusChains.insert(desktop, Chain());
}

void FocusChain::removeDesktop(VirtualDesktop *desktop)
{
    m_desktopFocusChains.remove(desktop);
}

Window *FocusChain::getForActivation(VirtualDesktop *desktop) const
{
    return getForActivation(desktop, workspace()->activeOutput());
}

Window *FocusChain::getForActivation(VirtualDesktop *desktop, LogicalOutput *output) const
{
    auto it = m_desktopFocusChains.constFind(desktop);
    if (it == m_desktopFocusChains.constEnd()) {
        return nullptr;
    }
    const auto &chain = it.value();
    for (int i = chain.size() - 1; i >= 0; --i) {
        auto tmp = chain.at(i);
        // TODO: move the check into Window
        if (tmp->isShown() && tmp->isOnCurrentActivity()
            && (!m_separateScreenFocus || tmp->output() == output)) {
            return tmp;
        }
    }
    return nullptr;
}

void FocusChain::update(Window *window, FocusChain::Change change)
{
    if (!window->wantsTabFocus()) {
        // Doesn't want tab focus, remove
        remove(window);
        return;
    }

    if (window->isOnAllDesktops()) {
        const VirtualDesktop *currentDesktop = VirtualDesktopManager::self()->currentDesktop(window->output());
        // Now on all desktops, add it to focus chains it is not already in
        for (auto it = m_desktopFocusChains.begin();
             it != m_desktopFocusChains.end();
             ++it) {
            auto &chain = it.value();
            // Making first/last works only on current desktop, don't affect all desktops
            if (it.key() == currentDesktop
                && (change == MakeFirst || change == MakeLast)) {
                if (change == MakeFirst) {
                    makeFirstInChain(window, chain);
                } else {
                    makeLastInChain(window, chain);
                }
            } else {
                insertWindowIntoChain(window, chain);
            }
        }
    } else {
        // Now only on desktop, remove it anywhere else
        for (auto it = m_desktopFocusChains.begin();
             it != m_desktopFocusChains.end();
             ++it) {
            auto &chain = it.value();
            if (window->isOnDesktop(it.key())) {
                updateWindowInChain(window, change, chain);
            } else {
                chain.removeAll(window);
            }
        }
    }

    // add for most recently used chain
    updateWindowInChain(window, change, m_mostRecentlyUsed);
}

void FocusChain::updateWindowInChain(Window *window, FocusChain::Change change, Chain &chain)
{
    if (change == MakeFirst) {
        makeFirstInChain(window, chain);
    } else if (change == MakeLast) {
        makeLastInChain(window, chain);
    } else {
        insertWindowIntoChain(window, chain);
    }
}

void FocusChain::insertWindowIntoChain(Window *window, Chain &chain)
{
    if (window->isDeleted()) {
        return;
    }
    if (chain.contains(window)) {
        return;
    }
    if (m_activeWindow && m_activeWindow != window && !chain.empty() && chain.last() == m_activeWindow) {
        // Add it after the active window
        chain.insert(chain.size() - 1, window);
    } else {
        // Otherwise add as the first one
        chain.append(window);
    }
}

void FocusChain::moveAfterWindow(Window *window, Window *reference)
{
    if (window->isDeleted()) {
        return;
    }
    if (!window->wantsTabFocus()) {
        return;
    }
    if (reference == window) {
        return;
    }

    for (auto it = m_desktopFocusChains.begin();
         it != m_desktopFocusChains.end();
         ++it) {
        if (!window->isOnDesktop(it.key())) {
            continue;
        }
        moveAfterWindowInChain(window, reference, it.value());
    }
    moveAfterWindowInChain(window, reference, m_mostRecentlyUsed);
}

void FocusChain::moveBeforeWindow(Window *window, Window *reference)
{
    if (window->isDeleted()) {
        return;
    }
    if (!window->wantsTabFocus()) {
        return;
    }
    if (reference == window) {
        return;
    }

    for (auto it = m_desktopFocusChains.begin();
         it != m_desktopFocusChains.end();
         ++it) {
        if (!window->isOnDesktop(it.key())) {
            continue;
        }
        moveBeforeWindowInChain(window, reference, it.value());
    }
    moveBeforeWindowInChain(window, reference, m_mostRecentlyUsed);
}

void FocusChain::moveAfterWindowInChain(Window *window, Window *reference, Chain &chain)
{
    if (window->isDeleted()) {
        return;
    }
    if (!chain.contains(reference)) {
        return;
    }
    if (Window::belongToSameApplication(reference, window)) {
        chain.removeAll(window);
        chain.insert(chain.indexOf(reference), window);
    } else {
        chain.removeAll(window);
        for (int i = 0; i < chain.size(); ++i) {
            if (Window::belongToSameApplication(reference, chain.at(i))) {
                chain.insert(i, window);
                break;
            }
        }
    }
}

void FocusChain::moveBeforeWindowInChain(Window *window, Window *reference, Chain &chain)
{
    if (window->isDeleted()) {
        return;
    }
    if (!chain.contains(reference)) {
        return;
    }
    if (Window::belongToSameApplication(reference, window)) {
        chain.removeAll(window);
        chain.insert(chain.indexOf(reference) + 1, window);
    } else {
        chain.removeAll(window);
        for (int i = chain.size() - 1; i >= 0; --i) {
            if (Window::belongToSameApplication(reference, chain.at(i))) {
                chain.insert(i + 1, window);
                break;
            }
        }
    }
}

Window *FocusChain::firstMostRecentlyUsed() const
{
    if (m_mostRecentlyUsed.isEmpty()) {
        return nullptr;
    }
    return m_mostRecentlyUsed.first();
}

Window *FocusChain::nextMostRecentlyUsed(Window *reference) const
{
    if (m_mostRecentlyUsed.isEmpty()) {
        return nullptr;
    }
    const int index = m_mostRecentlyUsed.indexOf(reference);
    if (index == -1) {
        return m_mostRecentlyUsed.first();
    }
    if (index == 0) {
        return m_mostRecentlyUsed.last();
    }
    return m_mostRecentlyUsed.at(index - 1);
}

// Adapted from the focus-candidate checks the old Workspace::activateNextClient() in
// activation.cpp performed inline before falling back to a window.
bool FocusChain::isUsableFocusCandidate(Window *c, Window *prev) const
{
    // if the candidate is the reference window itself
    if (c == prev) {
        // then (re)activating it is a no-op, so it is not a new candidate
        return false;
    }

    // if the window is deleted
    if (c->isDeleted()) {
        // then it is a zombie with no live surface: it stays in the focus chains
        // until the close animation finishes (see markAsDeleted()/addDeleted() and
        // Workspace::removeWaylandWindow(), which runs this search before the window
        // is removed), and its client process has typically already exited, so it
        // cannot take the focus
        return false;
    }

    // if the window is one of KWin's own helper surfaces (OSD, tabbox, debug console, ...)
    if (c->isInternal()) {
        // then it is a WindowType::Normal surface (see InternalWindow::windowType())
        // that can stay mapped all session, so it would win the fallback ahead of
        // real windows and leave the focus stuck on an invisible surface
        return false;
    }

    // if the window is owned by the compositor process itself
    if (c->pid() == getpid()) {
        // then it is a helper surface isInternal() misses (e.g. a layer-shell overlay
        // back on KWin's socket); use the same check KWin uses elsewhere to recognize
        // its own client connection (see WaylandWindow::killWindow(), WaylandServer)
        return false;
    }

    // if the window has declared itself not a real, user-facing window (skipSwitcher)
    if (c->skipSwitcher()) {
        // then requestFocus() takes the async WM_TAKE_FOCUS branch (see
        // X11Window::takesAsyncFocus()): it reports success without ever activating,
        // waiting on an XSetInputFocus these non-interactive helpers (screen-sharing
        // and the like) never send, so it would leave the focus stuck on it
        return false;
    }

    // if the window is not shown (minimized or hidden)
    if (!c->isShown()) {
        // then there is no visible surface to take the focus on
        return false;
    }

    // if the window is on another desktop
    if (!c->isOnCurrentDesktop()) {
        // then it is not reachable from the desktop the user is on
        return false;
    }

    // if the window belongs to another activity
    if (!c->isOnCurrentActivity()) {
        // then it is not reachable from the activity the user is in
        return false;
    }

    // if separate screen focus is on and the window is on another screen
    if (m_separateScreenFocus && !c->isOnOutput(prev ? prev->output() : workspace()->activeOutput())) {
        // then each screen keeps its own active window, so only one on the relevant
        // screen (the reference's, or the active screen's) is a candidate
        return false;
    }

    return true;
}

Window *FocusChain::nextForDesktop(Window *reference, VirtualDesktop *desktop) const
{
    auto it = m_desktopFocusChains.constFind(desktop);
    if (it == m_desktopFocusChains.constEnd()) {
        return nullptr;
    }
    const auto &chain = it.value();
    for (int i = chain.size() - 1; i >= 0; --i) {
        auto window = chain.at(i);
        if (isUsableFocusCandidate(window, reference)) {
            return window;
        }
    }
    return nullptr;
}

void FocusChain::makeFirstInChain(Window *window, Chain &chain)
{
    if (window->isDeleted()) {
        return;
    }
    chain.removeAll(window);
    chain.append(window);
}

void FocusChain::makeLastInChain(Window *window, Chain &chain)
{
    if (window->isDeleted()) {
        return;
    }
    chain.removeAll(window);
    chain.prepend(window);
}

bool FocusChain::contains(Window *window, VirtualDesktop *desktop) const
{
    auto it = m_desktopFocusChains.constFind(desktop);
    if (it == m_desktopFocusChains.constEnd()) {
        return false;
    }
    return it.value().contains(window);
}

} // namespace

#include "moc_focuschain.cpp"
