import React, { useState, useEffect } from 'react';

const WelcomeTour = ({ onComplete, darkMode }) => {
  const [step, setStep] = useState(0);
  const [show, setShow] = useState(false);

  const steps = [
    { title: "Welcome to ChatBox!", text: "Let's take a quick tour of the features", target: null },
    { title: "Send Messages", text: "Type here and press Enter to send messages", target: ".input-bar-field" },
    { title: "Rooms & Users", text: "Click here to see rooms and online users", target: "button[title='Rooms & Users']" },
    { title: "Search Messages", text: "Use search to find specific messages", target: "button[title*='search']" },
    { title: "Upload Files", text: "Click the gear icon to access file upload and more tools", target: "button[title='Show hidden icons']" }
  ];

  useEffect(() => {
    const hasSeenTour = localStorage.getItem('chatbox-tour-completed');
    if (!hasSeenTour) {
      setTimeout(() => setShow(true), 1000);
    }
  }, []);

  const nextStep = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      completeTour();
    }
  };

  const completeTour = () => {
    localStorage.setItem('chatbox-tour-completed', 'true');
    setShow(false);
    onComplete?.();
  };

  if (!show) return null;

  const currentStep = steps[step];

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      zIndex: 2000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{
        backgroundColor: darkMode ? '#1f2937' : '#ffffff',
        padding: '24px',
        borderRadius: '12px',
        maxWidth: '400px',
        margin: '20px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
      }}>
        <h3 style={{ margin: '0 0 12px 0', color: darkMode ? '#f9fafb' : '#111827' }}>
          {currentStep.title}
        </h3>
        <p style={{ margin: '0 0 20px 0', color: darkMode ? '#d1d5db' : '#6b7280' }}>
          {currentStep.text}
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: darkMode ? '#9ca3af' : '#6b7280' }}>
            {step + 1} of {steps.length}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={completeTour}
              style={{
                padding: '8px 16px',
                border: `1px solid ${darkMode ? '#374151' : '#d1d5db'}`,
                backgroundColor: 'transparent',
                color: darkMode ? '#d1d5db' : '#6b7280',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Skip
            </button>
            <button
              onClick={nextStep}
              style={{
                padding: '8px 16px',
                border: 'none',
                backgroundColor: darkMode ? '#0ea5a4' : '#2563eb',
                color: '#ffffff',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              {step === steps.length - 1 ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeTour;