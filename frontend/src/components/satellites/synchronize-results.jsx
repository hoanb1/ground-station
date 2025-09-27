import React from 'react';
import {Box, Typography} from '@mui/material';
import Grid2 from '@mui/material/Grid2';
import AddedItemsTable from './synchronize-added.jsx';
import ModifiedItemsTable from './synchronize-modifed.jsx';
import RemovedItemsTable from './synchronize-removed.jsx';
import PropTypes from 'prop-types';

const SyncResultsTable = ({
                              hasNewItems,
                              hasModifiedItems,
                              hasRemovedItems,
                              newSatellitesCount,
                              newTransmittersCount,
                              modifiedSatellitesCount,
                              modifiedTransmittersCount,
                              removedSatellitesCount,
                              removedTransmittersCount,
                              syncState
                          }) => {

    if (!hasNewItems && !hasModifiedItems && !hasRemovedItems) return null;

    return (
        <Box sx={{mt: 2}}>
            <Grid2
                container
                spacing={{xs: 1, sm: 1, md: 1}}
                sx={{
                    width: '100%',
                    justifyContent: 'flex-start'
                }}
            >
                <Grid2 size={{xs: 4, sm: 12, md: 4, lg: 4, xl: 4}}>
                    <AddedItemsTable
                        newSatellitesCount={newSatellitesCount}
                        newTransmittersCount={newTransmittersCount}
                        syncState={syncState}
                    />
                </Grid2>

                <Grid2 size={{xs: 4, sm: 12, md: 4, lg: 4, xl: 4}}>
                    <ModifiedItemsTable
                        modifiedSatellitesCount={modifiedSatellitesCount}
                        modifiedTransmittersCount={modifiedTransmittersCount}
                        syncState={syncState}
                    />
                </Grid2>

                <Grid2 size={{xs: 4, sm: 12, md: 4, lg: 4, xl: 4}}>
                    <RemovedItemsTable
                        removedSatellitesCount={removedSatellitesCount}
                        removedTransmittersCount={removedTransmittersCount}
                        syncState={syncState}
                    />
                </Grid2>
            </Grid2>
        </Box>
    );
};

SyncResultsTable.propTypes = {
    hasNewItems: PropTypes.bool.isRequired,
    hasModifiedItems: PropTypes.bool.isRequired,
    hasRemovedItems: PropTypes.bool.isRequired,
    newSatellitesCount: PropTypes.number.isRequired,
    newTransmittersCount: PropTypes.number.isRequired,
    modifiedSatellitesCount: PropTypes.number.isRequired,
    modifiedTransmittersCount: PropTypes.number.isRequired,
    removedSatellitesCount: PropTypes.number.isRequired,
    removedTransmittersCount: PropTypes.number.isRequired,
    syncState: PropTypes.object.isRequired,
};

export default SyncResultsTable;