import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, Typography } from '@mui/material';
import ErrorIcon from '@mui/icons-material/Error';

const WaterfallErrorDialog = ({ open, message, onClose }) => (
    <Dialog open={open} onClose={onClose} aria-labelledby="error-dialog-title" aria-describedby="error-dialog-description">
        <DialogTitle id="error-dialog-title" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ErrorIcon color="error" />
            <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Error Occurred</Typography>
        </DialogTitle>
        <DialogContent>
            <DialogContentText id="error-dialog-description" sx={{ whiteSpace: 'pre-wrap' }}>
                {message}
            </DialogContentText>
        </DialogContent>
        <DialogActions>
            <Button onClick={onClose} variant="contained" color="error" autoFocus>
                Close
            </Button>
        </DialogActions>
    </Dialog>
);

export default WaterfallErrorDialog;
