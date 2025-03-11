import {styled} from "@mui/material/styles";

export const StyledIslandParent = styled("div")(({ theme }) => ({
    padding: '0rem',
    border: '1px solid #424242',
    backgroundColor: "#1e1e1e",
    overflow: 'hidden',
}));

export const StyledIslandParentScrollbar = styled("div")(({ theme }) => ({
    padding: '0rem',
    border: '1px solid #424242',
    backgroundColor: "#1e1e1e",
    overflow: 'hidden',
    overflowY: 'hidden',
    overflowX: 'hidden',

}));

export const CODEC_JSON = {
    parse: (value) => {
        try {
            return JSON.parse(value);
        } catch {
            return { _error: 'parse failed' };
        }
    },
    stringify: (value) => JSON.stringify(value),
};

export const CODEC_BOOL = {
    parse: (value) => {
        return value === "1";
    },
    stringify: (value) => {
        try {
            return value === true? "1" : "0";
        } catch {
            return "0";
        }
    },
};