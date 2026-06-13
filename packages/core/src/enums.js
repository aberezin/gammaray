"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncStatus = exports.ConflictStatus = void 0;
var ConflictStatus;
(function (ConflictStatus) {
    ConflictStatus["None"] = "none";
    ConflictStatus["Detected"] = "detected";
    ConflictStatus["Resolved"] = "resolved";
})(ConflictStatus || (exports.ConflictStatus = ConflictStatus = {}));
var SyncStatus;
(function (SyncStatus) {
    SyncStatus["Synced"] = "synced";
    SyncStatus["Syncing"] = "syncing";
    SyncStatus["Offline"] = "offline";
    SyncStatus["Conflict"] = "conflict";
    SyncStatus["Error"] = "error";
})(SyncStatus || (exports.SyncStatus = SyncStatus = {}));
//# sourceMappingURL=enums.js.map