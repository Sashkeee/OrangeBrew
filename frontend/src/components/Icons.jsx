import React from 'react';

const IconBase = ({ children, size = 24, color = 'currentColor', className = '', ...props }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`orangebrew-icon ${className}`}
        {...props}
    >
        {children}
    </svg>
);

// --- Brewing Stages ---

export const MashingIcon = (props) => (
    <IconBase {...props}>
        <path d="M4 11V19C4 20.1046 4.89543 21 6 21H18C19.1046 21 20 20.1046 20 19V11" />
        <path d="M2 11H22L20 7H4L2 11Z" />
        <circle cx="9" cy="14" r="1" fill="currentColor" />
        <circle cx="15" cy="14" r="1" fill="currentColor" />
        <circle cx="12" cy="17" r="1" fill="currentColor" />
    </IconBase>
);

export const BoilingIcon = (props) => (
    <IconBase {...props}>
        <path d="M5 10V18C5 19.1046 5.89543 20 7 20H17C18.1046 20 19 19.1046 19 18V10" />
        <path d="M2 10H22" />
        <path d="M9 6V2" />
        <path d="M12 7V4" />
        <path d="M15 6V2" />
        <path d="M8 20C8 21.1046 8.89543 22 10 22H14C15.1046 22 16 21.1046 16 20" />
    </IconBase>
);

export const FermentationIcon = (props) => (
    <IconBase {...props}>
        <path d="M6 3H18L19 12C19 15.866 15.866 19 12 19C8.13401 19 5 15.866 5 12L6 3Z" />
        <path d="M12 19V22" />
        <path d="M9 22H15" />
        <circle cx="10" cy="8" r="1" fill="currentColor" />
        <circle cx="14" cy="11" r="1" fill="currentColor" />
        <circle cx="11" cy="14" r="1" fill="currentColor" />
    </IconBase>
);

export const DistillationIcon = (props) => (
    <IconBase {...props}>
        <path d="M4 20V14C4 11.7909 5.79086 10 8 10H9L12 4L15 10H16C18.2091 10 20 11.7909 20 14V20" />
        <path d="M2 20H22" />
        <path d="M12 10V14" />
        <circle cx="12" cy="17" r="1" fill="currentColor" />
    </IconBase>
);

export const RectificationIcon = (props) => (
    <IconBase {...props}>
        <path d="M9 22V2" />
        <path d="M15 22V2" />
        <path d="M9 6H15" />
        <path d="M9 10H15" />
        <path d="M9 14H15" />
        <path d="M9 18H15" />
        <path d="M5 22H19" />
    </IconBase>
);

// --- Ingredients ---

export const HopsIcon = (props) => (
    <IconBase {...props}>
        <path d="M12 2C12 2 15 5 15 9C15 13 12 16 12 16C12 16 9 13 9 9C9 5 12 2 12 2Z" />
        <path d="M12 8C12 8 17 10 17 14C17 18 12 21 12 21C12 21 7 18 7 14C7 10 12 8 12 8Z" />
    </IconBase>
);

export const MaltIcon = (props) => (
    <IconBase {...props}>
        <path d="M7 20C7 20 4 17 4 13C4 9 7 4 12 2C17 4 20 9 20 13C20 17 17 20 17 20" />
        <path d="M12 2V22" />
        <path d="M12 8L16 6" />
        <path d="M12 12L8 10" />
        <path d="M12 16L16 14" />
    </IconBase>
);

export const YeastIcon = (props) => (
    <IconBase {...props}>
        <circle cx="12" cy="12" r="5" />
        <circle cx="18" cy="8" r="2" />
        <circle cx="6" cy="16" r="3" />
        <circle cx="16" cy="17" r="2" />
    </IconBase>
);

export const WaterIcon = (props) => (
    <IconBase {...props}>
        <path d="M12 22C16.4183 22 20 18.4183 20 14C20 8 12 2 12 2C12 2 4 8 4 14C4 18.4183 7.58172 22 12 22Z" />
    </IconBase>
);

// --- Hardware ---

export const ESP32Icon = (props) => (
    <IconBase {...props}>
        <rect x="5" y="5" width="14" height="14" rx="2" />
        <path d="M9 9H15V15H9V9Z" strokeWidth="1" />
        <path d="M5 8H3" />
        <path d="M5 12H3" />
        <path d="M5 16H3" />
        <path d="M19 8H21" />
        <path d="M19 12H21" />
        <path d="M19 16H21" />
        <path d="M8 5V3" />
        <path d="M12 5V3" />
        <path d="M16 5V3" />
        <path d="M8 19V21" />
        <path d="M12 19V21" />
        <path d="M16 19V21" />
    </IconBase>
);

export const SensorIcon = (props) => (
    <IconBase {...props}>
        <path d="M14 4V20" />
        <path d="M10 4V20" />
        <path d="M10 4C10 2.89543 10.8954 2 12 2C13.1046 2 14 2.89543 14 4" />
        <circle cx="12" cy="18" r="3" />
        <path d="M12 15V8" />
    </IconBase>
);

export const PumpIcon = (props) => (
    <IconBase {...props}>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="2" />
        <path d="M12 4V8" />
        <path d="M12 16V20" />
        <path d="M4 12H8" />
        <path d="M16 12H20" />
    </IconBase>
);

export const HeaterIcon = (props) => (
    <IconBase {...props}>
        <path d="M7 2V18C7 20.2091 8.79086 22 11 22C13.2091 22 15 20.2091 15 18V6" />
        <path d="M11 2V18" />
        <path d="M15 6V2" />
    </IconBase>
);
