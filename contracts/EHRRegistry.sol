// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract EHRRegistry {
    event UserRegistered(string userId, string role, string metadata);
    event EHRUploaded(string ehrId, string ownerId, string cid);
    event AccessRequested(string reqId, string ehrId, string requesterId);
    event AccessApproved(string reqId, string ehrId, string approverId);
    event AccessRevoked(string reqId, string ehrId, string revokerId);

    function registerUser(string calldata userId, string calldata role, string calldata metadata) external {
        emit UserRegistered(userId, role, metadata);
    }
    function uploadEHR(string calldata ehrId, string calldata ownerId, string calldata cid) external {
        emit EHRUploaded(ehrId, ownerId, cid);
    }
    function requestAccess(string calldata reqId, string calldata ehrId, string calldata requesterId) external {
        emit AccessRequested(reqId, ehrId, requesterId);
    }
    function approveAccess(string calldata reqId, string calldata ehrId, string calldata approverId) external {
        emit AccessApproved(reqId, ehrId, approverId);
    }
    function revokeAccess(string calldata reqId, string calldata ehrId, string calldata revokerId) external {
        emit AccessRevoked(reqId, ehrId, revokerId);
    }
}
