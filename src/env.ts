// SPDX-License-Identifier: GPL-3.0-only
// Set to true at build time by the browser bundle (vite.lib.config.ts, demo/vite config) so Node-only code is removed.
declare const __ACE_BROWSER__: boolean | undefined;
export const BROWSER_BUILD: boolean = typeof __ACE_BROWSER__ !== "undefined" && __ACE_BROWSER__;
