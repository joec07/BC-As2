// SPDX-License-Identifier: MIT
pragma solidity ^0.8;
import "@openzeppelin/contracts/utils/Strings.sol";

contract Bank {
    address payable owner;
    address payable[2] players;
    uint256 stage;
    bytes32[2] hashes;
    uint256[2] values;
    uint256[2] deposits;

    modifier onlyPlayer() {
        require(
            msg.sender == players[0] || msg.sender == players[1]
        );
        _;
    }

    modifier onlyPlayerOrOwner() {
        require(
            msg.sender == players[0] ||
                msg.sender == players[1] ||
                msg.sender == owner
        );
        _;
    }

    event GameResult(
        uint256 player1_value,
        uint256 player2_value,
        uint256 deposit_amount,
        string winner
    );

    constructor() {
        // please change the owner address 
        owner = payable(address(0));
        stage = 0;
        players[0] = payable(address(0));
        players[1] = payable(address(0));
    }


    function get_stage() public view returns (uint256) {
        return stage;
    }

    function get_players() public view returns (address, address) {
        return (players[0], players[1]);
    }

    function get_values() public view returns (uint256, uint256) {
        return (values[0], values[1]);
    }

    function init_game() public {
        require(stage == 5 || msg.sender == owner);
        stage = 0;
        players[0] = payable(address(0));
        players[1] = payable(address(0));
    }

    function set_commitment(bytes32 commitment) public payable {
        require(stage == 0 || stage == 1);
        require(msg.value == 20 ether);
        require(msg.sender != players[0] && msg.sender != players[1]);
        if (stage == 0) {
            players[0] = payable(msg.sender);
            hashes[0] = commitment;
            deposits[0] = msg.value;
        } else {
            players[1] = payable(msg.sender);
            hashes[1] = commitment;
            deposits[1] = msg.value;
        }
        stage += 1;
    }

    function reveal(uint256 _value, string calldata ranChar) public onlyPlayer {
        if (msg.sender == players[0]) {
            require(stage == 3);
            require(
                hashes[0] ==
                    keccak256(
                        abi.encodePacked(
                            string.concat(Strings.toString(_value), ranChar)
                        )
                    )
            );
            values[0] = _value;
        } else {
            require(stage == 2);
            require(
                hashes[1] ==
                    keccak256(
                        abi.encodePacked(
                            string.concat(Strings.toString(_value), ranChar)
                        )
                    )
            );
            values[1] = _value;
        }
        stage += 1;
    }

    function settle() public onlyPlayerOrOwner {
        require(stage == 4);
        (bool success1, ) = owner.call{
            value: ((deposits[0] + deposits[1]) / 100) * 5
        }("");
        require(success1);
        if (((values[0] + values[1]) % 2) == 0) {
            (bool success2, ) = players[0].call{
                value: ((deposits[0] + deposits[1]) / 100) * 95
            }("");
            require(success2);
            emit GameResult(
                values[0],
                values[1],
                deposits[0] + deposits[1],
                "Player 1 wins"
            );
        } else {
            (bool success2, ) = players[1].call{
                value: ((deposits[0] + deposits[1]) / 100) * 95
            }("");
            require(success2);
            emit GameResult(
                values[0],
                values[1],
                deposits[0] + deposits[1],
                "Player 2 wins"
            );
        }
        stage += 1;
    }
}
