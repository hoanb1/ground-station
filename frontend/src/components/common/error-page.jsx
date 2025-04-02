import React from 'react';
import { Link, useRouteError } from 'react-router-dom';

import {Container, Typography, Button, Box} from '@mui/material';

const ErrorPage = () => {
    const error = useRouteError();
    const [showStack, setShowStack] = React.useState(false);

    return (
        <Container
            maxWidth="lg"
            style={{
                display: 'flex',
                maxHeight: '100vh',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                textAlign: 'center'
            }}
        >
            <Box>
                <Typography variant="h3" color="error">
                    Error {error?.status || 'Unknown'}
                </Typography>
                <Typography variant="h5" color="textSecondary" gutterBottom>
                    {error?.statusText || 'Something went wrong'}
                </Typography>
                <Typography variant="body1" color="textSecondary" style={{marginBottom: '16px'}}>
                    {error?.message || 'An unexpected error has occurred, please try again later.'}
                </Typography>
                <Box>
                    <Button
                        variant="text"
                        color="primary"
                        size="small"
                        onClick={() => setShowStack(prev => !prev)}
                        style={{textTransform: 'none', marginBottom: '8px'}}
                    >
                        {showStack ? 'Hide Stack Trace' : 'Show Stack Trace'}
                    </Button>
                    {showStack && (
                        <Box
                            style={{
                                overflow: 'auto',
                                fontSize: '12px',
                                marginTop: '16px',
                                whiteSpace: 'pre-wrap',
                                textAlign: 'left',
                                width: '100%',
                                height: '300px',
                            }}
                        >
                            {error?.stack || 'No stack trace available.'}
                        </Box>
                    )}
                </Box>
            </Box>
            <Button
                variant="contained"
                color="primary"
                size="large"
                onClick={() => window.location.href = '/feed'}
            >
                Back to Home
            </Button>
        </Container>
    );
};

export default ErrorPage;
