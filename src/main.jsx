import { eth, Web3 } from 'web3';
import { useState, useEffect, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
    AppBar,
    Box,
    Button,
    CssBaseline,
    Dialog,
    GlobalStyles,
    IconButton,
    InputAdornment,
    LinearProgress,
    List,
    ListItem,
    ListItemIcon,
    MenuItem,
    Stack,
    TextField,
    Toolbar,
    Typography,
} from '@mui/material';
import {
    Add,
    BorderAll,
    CurrencyExchange,
    Details,
    HistoryOutlined,
    Home,
    Info,
    InfoOutlined,
    NorthEast,
    Payment,
    Receipt,
    Send,
    SouthWest,
    TransferWithinAStation,
    Visibility,
    VisibilityOff
} from '@mui/icons-material';
import { create } from 'zustand';
import { DataGrid, GridToolbarContainer } from "@mui/x-data-grid";
import { BrowserRouter, createBrowserRouter, Link, Route, RouterProvider, Routes } from "react-router-dom";
import { enqueueSnackbar, SnackbarProvider } from "notistack";
import './style.css'
import abi from './abi'


const web3 = new Web3('ws://localhost:8546'); //local Geth node
await web3.eth.wallet.load('')
web3.eth.handleRevert = true

// !!!---------------------------------------- please change the contract address ----------------------------------------!!!
const contractAddress = '0x358cd5EeE5b22a133DA1A8530b2ebe076D28BF52'

const contract = new web3.eth.Contract(abi, contractAddress)

const useWalletStore = create((set) => ({
    wallet: [...web3.eth.wallet], createAccount: async () => {
        const newAccount = web3.eth.accounts.create();
        web3.eth.wallet.add(newAccount);
        await web3.eth.wallet.save('');
        set({ wallet: [...web3.eth.wallet] });
    }
}))

const History = () => {
    const [history, setHistory] = useState([]);
    const [pending, setPending] = useState(false);

    const load = async () => {
        setPending(true);
        const lastBlockNumber = parseInt(history.at(-1)?.blockNumber ?? -1);
        const newHistory = [];
        for (let i = lastBlockNumber + 1; i <= await web3.eth.getBlockNumber(); i++) {
            const block = await web3.eth.getBlock(i);//traverse the blocks
            for (const txHash of block.transactions ?? []) {
                const tx = await web3.eth.getTransaction(txHash);//Obtain the transaction by hash
                const receipt = await web3.eth.getTransactionReceipt(txHash);
                newHistory.push({ ...tx, ...receipt, timestamp: block.timestamp })
                console.log(newHistory);
            }//obtain the transaction
        }
        setHistory((prevHistory) => [...prevHistory, ...newHistory]);//Put together the new history and the old ones
        setPending(false);
    }

    useEffect(() => {
        load()
    }, []);

    //Monitor the chain (creation of new block)
    useEffect(() => {
        let subscription;
        (async () => {
            subscription = await web3.eth.subscribe('newHeads');
            subscription.on('data', async (params) => {
                const block = await web3.eth.getBlock(params.number);
                const newHistory = [];
                for (const txHash of block.transactions ?? []) {
                    const tx = await web3.eth.getTransaction(txHash);
                    const receipt = await web3.eth.getTransactionReceipt(txHash);
                    newHistory.push({ ...tx, ...receipt, timestamp: block.timestamp })
                }
                setHistory((prevHistory) => {
                    const history = [...prevHistory];
                    for (const i of newHistory) {
                        if (history.length === 0 || i.blockNumber > history.at(-1).blockNumber) {
                            history.push(i);
                        }
                    }
                    return history;
                });
            });
        })();
        return () => {
            subscription?.unsubscribe();
        }
    }, []);

    const getMethodName = (inputData) => {
        // Find the function based on the input data
        const functionSelector = inputData.slice(0, 10);
        for (let i = 0; i < abi.length; i++) {
            const functionAbi = abi[i];
            if (functionAbi.type != 'function') continue;
            const abiEncodedFunctionSignature = web3.eth.abi.encodeFunctionSignature(functionAbi);
            if (abiEncodedFunctionSignature === functionSelector) {
                return functionAbi.name;
            }
        }
        return "";
    }

    const getLog = (inputData) => {
        var log = ''
        abi.map((obj) => {
            if (obj.type == 'event' && obj.name == 'GameResult') {
                log = web3.eth.abi.decodeLog(obj.inputs, inputData.data, inputData.topics)['winner']
                return
            }
        })
        return log
    }

    return (
        <Box
            sx={{
                height: 1000, p: 2,
            }}>
            <DataGrid
                rows={history}
                loading={pending}
                columns={[{
                    field: 'transactionHash', headerName: 'Tx Hash', width: 400,
                }, {
                    field: 'from', headerName: 'From', width: 400
                }, {
                    field: 'to', headerName: 'To', width: 400
                }, {
                    field: 'value',
                    headerName: 'Value (ETH)',
                    width: 200,
                    valueGetter: ({ value }) => web3.utils.fromWei(value, 'ether')
                }, {
                    field: 'timestamp',
                    headerName: 'Time',
                    type: 'dateTime',
                    valueGetter: ({ value }) => new Date(parseInt(value) * 1000),
                    width: 300,
                }, {
                    field: 'input',
                    headerName: 'Method',
                    width: 200,
                    valueGetter: ({ value }) => value ? getMethodName(value) : ''

                }, {
                    field: 'logs',
                    headerName: 'Log',
                    width: 200,
                    valueGetter: ({ value }) => (value.length > 0 ? getLog(value[0]) : '')

                }]}
                getRowId={(row) => row.transactionHash}
                disableRowSelectionOnClick
            />
        </Box>
    );
};

const UI = ({ me, setError}) => {
    const [ranChar, setRanChar] = useState('');
    const [ranNum, setRanNum] = useState(0);
    const [hash, setHash] = useState(0);
    const [stage, setStage] = useState(0);
    const [values, setValues] = useState([])
    const [winner, setWinner] = useState('')
    const [deposit, setDeposit] = useState(0)
    const [players, setPlayers] = useState([]);

    useEffect(() => {
        updateStage();
        generateRandomNumAndRanChar();
    }, [me])


    useEffect(() => {
        let subscription;
        (async () => {
            subscription = await web3.eth.subscribe('newHeads');
            subscription.on('data', async (params) => {
                const block = await web3.eth.getBlock(params.number);
                for (const txHash of block.transactions ?? []) {
                    const tx = await web3.eth.getTransaction(txHash);
                    if (tx.to == contractAddress.toLocaleLowerCase()) {
                        await updateStage()
                    }
                }
            });
        })();
        return () => {
            subscription?.unsubscribe();
        }
    }, []);

    useEffect(() => {
        contract.events.GameResult({ fromBlock: 'latest' }).on('data', (event) => {
            const { returnValues } = event
            setValues([parseInt(returnValues.player1_value), parseInt(returnValues.player2_value)])
            setDeposit(web3.utils.fromWei(returnValues.deposit_amount, 'ether'))
            setWinner(returnValues['winner'])
        })

    }, [])

    useEffect(() => {
        if (stage == 1 || stage == 2) {
            updatePlayer()
        } else if (stage == 5) {
            updateValue()
        }
    }, [stage])


    const updateStage = async () => {
        await contract.methods.get_stage().call().then((result) => {
            setStage(parseInt(result))
        }).catch((error) => {
            setError(error)
        })

    }

    const generateRandomNumAndRanChar = () => {
        // generate a number bewteen 1 and 10000
        const num = Math.floor((Math.random() * 10000) + 1)
        let result = '';
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
        let counter = 0;
        while (counter < 5) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
            counter += 1;
        }
        setRanChar(result)
        setRanNum(num)
        setHash(web3.utils.keccak256(num + result))
    }

    const updatePlayer = async () => {
        await contract.methods.get_players().call().then((result) => {
            setPlayers(result)
        }).catch((error) => {
            setError(error)
        })
    }

    const updateValue = async () => {
        await contract.methods.get_values().call().then((result) => {
            setValues(result)
        }).catch((error) => {
            setError(error)
        })
    }

    const getStageString = () => {
        var str = ""
        if (stage == 0) {
            str = "Uninitialized"
        } else if (stage == 1) {
            str = "Player 1 committed"
        } else if (stage == 2) {
            str = "Player 2 committed"
        } else if (stage == 3) {
            str = "Player 2 revealed"
        } else if (stage == 4) {
            str = "Player 1 revealed"
        } else if (stage == 5) {
            str = `Settled, ${winner} (player 1: ${values[0]}, player 2: ${values[1]})`
        }
        return str
    }

    const getPlayerString = () => {
        return players[1] == me.address ? "You are player 2" : "You are player 1"
    }

    const getNextStageString = () => {
        var str = ""
        if (stage == 0) {
            str = "Join the game via sending a commitment (Current: 0/2 players)"
        } else if (stage == 1) {
            str = "Join the game via sending a commitment (Current: 1/2 players)"
        } else if (stage == 2) {
            str = players[1] == me.address ? "Please reveal your value" : players[0] == me.address ? "Waiting for player 2 to reveal" : "Please wait until the game has ended"
        } else if (stage == 3) {
            str = players[1] == me.address ? "Waiting for Player 1 to reveal" : players[0] == me.address ? "Please reveal your value" : "Please wait until the game has ended"
        } else if (stage == 4) {
            str = "Waiting to settle"
        } else if (stage == 5) {
            str = "Game over, click reset to play again"
        }
        return str
    }

    const initGame = async () => {
        const encoded = contract.methods.init_game().encodeABI()
        await web3.eth.sendSignedTransaction((await me.signTransaction({
            to: contractAddress, from: me.address, gas: 1000000, data: encoded,
        })).rawTransaction).catch((e) => {
            setError(e)
        })
    }

    const commit = async () => {
        const encoded = contract.methods.set_commitment(hash).encodeABI()
        await web3.eth.sendSignedTransaction((await me.signTransaction({
            to: contractAddress, from: me.address, gas: 1000000, value: web3.utils.toWei('20', 'ether'), data: encoded,
        })).rawTransaction).catch((e) => {
            setError(e)
        })

    }

    const reveal = async () => {
        const encoded = contract.methods.reveal(ranNum, ranChar).encodeABI()
        await web3.eth.sendSignedTransaction((await me.signTransaction({
            to: contractAddress, from: me.address, gas: 1000000, data: encoded,
        })).rawTransaction).catch((e) => {
            setError(e)
        })
    }

    const settle = async () => {
        const encoded = contract.methods.settle().encodeABI()
        await web3.eth.sendSignedTransaction((await me.signTransaction({
            to: contractAddress, from: me.address, gas: 1000000, data: encoded,
        })).rawTransaction).catch((e) => {
            setError(e)
        })
    }


    return (
        <>
            {
                me ?
                    <div className='Container'>
                        <div className="stageContainer">
                            Stage: {getStageString()}
                        </div>
                        {(stage != 0 && (players[0] == me.address || players[1] == me.address)) &&
                            <div className="playerContainer">
                                {getPlayerString()}
                            </div>
                        }
                        <div className="nextStageContainer">
                            Next: {getNextStageString()}
                        </div>
                        <TextField
                            label='Random chosen value'
                            value={hash}
                            className='RandomNumHashTextField'
                        />
                        <div className="btnContainer">
                            <Button
                                className='btn'
                                onClick={async () => { await commit() }}
                                sx={styles.btnStyle}
                            >
                                COMMIT
                            </Button>
                            <Button
                                className='btn'
                                onClick={async () => { await reveal(); }}
                                sx={styles.btnStyle}
                            >
                                REVEAL
                            </Button>
                            <Button
                                className='btn'
                                onClick={async () => { await settle(); }}
                                sx={styles.btnStyle}
                            >
                                SETTLE
                            </Button>
                            <Button
                                className='btn'
                                onClick={async () => {
                                    generateRandomNumAndRanChar()
                                    if (stage == 5) {
                                        setPlayers([])
                                        setStage(0);
                                        setPlayers([]);
                                        await initGame();
                                    }
                                }}
                                sx={styles.btnStyle}
                                disabled={stage != 5 && stage != 0}
                            >
                                RESET
                            </Button>
                        </div>
                    </div >
                    :
                    <p className='loginReminderText'>
                        Please select a wallet first
                    </p>
            }
        </>
    )
}

const Index = () => {
    const wallet = useWalletStore((state) => state.wallet);
    const createAccount = useWalletStore((state) => state.createAccount);// Create account
    const [currentAccount, setCurrentAccount] = useState();
    const [infoOpen, setInfoOpen] = useState(false);
    const [paymentOpen, setPaymentOpen] = useState(false);
    const [showPrivateKey, setShowPrivateKey] = useState(false);
    const me = currentAccount === undefined ? undefined : wallet[currentAccount];
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const [balance, setBalance] = useState(0);
    const [recipientAddress, setRecipientAddress] = useState('');
    const [amount, setAmount] = useState(0);

    useEffect(() => {
        if (currentAccount !== undefined && !pending) {
            web3.eth.getBalance(wallet[currentAccount].address).then(setBalance);
        }
    }, [currentAccount, pending]);

    useEffect(() => {
        if (error) {
            enqueueSnackbar(error, {
                variant: 'error'
            })
            setError('');
        }
    }, [error]);

    return <>
        {pending && <LinearProgress sx={{ position: 'fixed', top: 0, left: 0, zIndex: 10000, width: '100%' }} />}
        <AppBar color='transparent' position='static'>
            <Toolbar>
                <IconButton color='primary' component={Link} to='/'>
                    <Home />
                </IconButton>
                <IconButton color='primary' component={Link} to='/history'>
                    <HistoryOutlined />
                </IconButton>
                <Box ml='auto'></Box>
                <TextField
                    sx={{
                        width: 500
                    }}
                    size='small'
                    select
                    label="Account"
                    value={currentAccount ?? ''}
                    onChange={e => {
                        setCurrentAccount(e.target.value);
                    }}
                >
                    {wallet.map((a, i) => <MenuItem key={i} value={i}>{a.address}</MenuItem>)}
                </TextField>
                <IconButton color='primary' onClick={() => {
                    createAccount();
                }}>
                    <Add />
                </IconButton>
                <IconButton color='primary' disabled={me === undefined} onClick={() => {
                    setInfoOpen(true);
                }}>
                    <InfoOutlined />
                </IconButton>
                <IconButton color='primary' disabled={me === undefined} onClick={() => {
                    setPaymentOpen(true);
                }}>
                    <Payment />
                </IconButton>
            </Toolbar>
        </AppBar>
        <Routes>
            <Route path='/history' element={<History />} />
            <Route path='/' element={<UI me={me} setError={setError} />} />
        </Routes>
        <Dialog open={infoOpen} onClose={() => setInfoOpen(false)}>
            <Stack gap={2} sx={{
                width: 500, margin: 2, display: 'flex', flexDirection: 'column',
            }}>
                <TextField
                    label='Balance'
                    value={web3.utils.fromWei(balance, 'ether')}
                    InputProps={{
                        endAdornment: <InputAdornment position="end">
                            ETH
                        </InputAdornment>
                    }}
                ></TextField>
                <TextField
                    label='Private Key'
                    type={showPrivateKey ? 'text' : 'password'} value={me?.privateKey}
                    InputProps={{
                        endAdornment: <InputAdornment position="end">
                            <IconButton
                                aria-label="toggle password visibility"
                                onClick={() => setShowPrivateKey((show) => !show)}
                                onMouseDown={(e) => e.preventDefault()}
                                edge="end"
                            >
                                {showPrivateKey ? <VisibilityOff /> : <Visibility />}
                            </IconButton>
                        </InputAdornment>
                    }}
                />
                <TextField
                    label='Address'
                    value={me?.address}
                />
            </Stack>
        </Dialog>
        <Dialog open={paymentOpen} onClose={() => {
            setPaymentOpen(false);
            setRecipientAddress('');
            setAmount(0);
        }}>
            <Stack gap={2} sx={{
                width: 500, margin: 2, display: 'flex', flexDirection: 'column',
            }}>
                <TextField
                    label='From'
                    value={me?.address}
                />
                <TextField
                    label='To'
                    value={recipientAddress}
                    onChange={(e) => {
                        setRecipientAddress(e.target.value);
                    }}
                />
                <TextField
                    label='Amount'
                    type='number'
                    value={amount}
                    onChange={(e) => {
                        setAmount(e.target.value);
                    }}
                    InputProps={{
                        endAdornment: <InputAdornment position="end">
                            ETH
                        </InputAdornment>
                    }}
                />
                <Button onClick={async () => { //Transfer money
                    setPending(true);
                    try {
                        await web3.eth.sendSignedTransaction((await me.signTransaction({
                            to: recipientAddress, from: me.address, gas: 1000000, value: web3.utils.toWei(amount, 'ether'),
                        })).rawTransaction);
                        setPaymentOpen(false);
                        setRecipientAddress('');
                        setAmount(0);
                    } catch (e) {
                        setError(e.message);
                    }
                    setPending(false);
                }}>
                    Send
                </Button>
            </Stack>
        </Dialog>

    </>
}

const styles = {
    btnStyle: {
        borderRadius: 1,
        backgroundColor: '#357fd3',
        color: 'white',
        fontSize: 13,
        "&:hover": {
            backgroundColor: '#357fd3'
        }
    }
}

const App = () => {
    return <>
        <CssBaseline />
        <SnackbarProvider
            autoHideDuration={5000}
        />
        <BrowserRouter>
            <Index />
        </BrowserRouter>
    </>
}
createRoot(document.getElementById('root')).render(<App />);





