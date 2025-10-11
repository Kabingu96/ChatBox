import React from 'react';

const LoadingSpinner = ({ size = 16, color = '#0ea5a4' }) => (
  <div
    style={{
      width: size,
      height: size,
      border: `2px solid transparent`,
      borderTop: `2px solid ${color}`,
      borderRadius: '50%',
      animation: 'spin 1s linear infinite',
      display: 'inline-block',
    }}
  />
);

export default LoadingSpinner;