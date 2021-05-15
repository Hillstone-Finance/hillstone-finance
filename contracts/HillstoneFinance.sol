// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;


import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

abstract contract BlackList is Ownable, ERC20 {

    mapping (address => bool) public isBlackListed;

    function getBlackListStatus(address _addr) external view returns (bool) {
        return isBlackListed[_addr];
    }
    
    function addBlackList (address _addr) public onlyOwner {
        isBlackListed[_addr] = true;
        emit AddedBlackList(_addr);
    }

    function removeBlackList (address _addr) public onlyOwner {
        isBlackListed[_addr] = false;
        emit RemovedBlackList(_addr);
    }

    function retrieveBlackFunds (address _blackListedUser) public onlyOwner {
        require(isBlackListed[_blackListedUser]);
        uint dirtyFunds = balanceOf(_blackListedUser);
        _transfer(_blackListedUser, owner(), dirtyFunds);
        emit RetrievedBlackFunds(_blackListedUser, dirtyFunds);
    }

    event AddedBlackList(address _user);

    event RemovedBlackList(address _user);

    event RetrievedBlackFunds(address _blackListedUser, uint _balance);

}

contract HillstoneFinance is ERC20, BlackList {

    using SafeMath for uint256;
    uint256 constant private _initial_supply = 100000000000000000000000000;

    constructor() ERC20("Hillstone.Finance", "HSF") {
        _mint(msg.sender, _initial_supply);
    }

    function transfer(address _to, uint _value) public override returns (bool success) {
        require(!isBlackListed[msg.sender], "HSF/transfer: Should not transfer from blacklisted address");
        return super.transfer(_to, _value);
    }

    function transferFrom(address _from, address _to, uint _value) public override returns (bool success) {
        require(!isBlackListed[_from], "HSF/transferFrom: Should not transfer from blacklisted address");
        return super.transferFrom(_from, _to, _value);
    }
}

