import * as React from 'react';
import Snackbar from '@mui/material/Snackbar';

export default function NotificationBar({initialState}) {
    const [state, setState] = React.useState({...initialState});
    const { open, message } = state;

    React.useEffect(() => {
        setState({...initialState});

        return () => {
            handleClose();
        };

    }, [initialState]);
    
    const handleClick = (newState) => () => {
        setState({ ...newState, open: true });
    };

    const handleClose = () => {
        setState({ ...state, open: false });
    };

    return (
        <Snackbar
            anchorOrigin={{ vertical: "top", horizontal: "right" }}
            open={open}
            onClose={handleClose}
            message={message}
            key={Math.random().toString(36).substring(2, 15)}
        />
    );
}

