import { useState, useEffect } from 'react';
import Joyride, { STATUS } from 'react-joyride';
import { useTranslation } from 'next-i18next';
import { supabase } from '../lib/supabaseClient';

export default function DashboardTour({ run, userId, onFinish }) {
  const { t } = useTranslation('dashboard');
  const [isMounted, setIsMounted] = useState(false);

  // Prevent hydration mismatch by only rendering on client
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const steps = [
    {
      target: 'body',
      content: t('tour.welcome_content'),
      title: t('tour.welcome_title'),
      placement: 'center',
    },
    {
      target: '.tour-credits',
      content: t('tour.credits_content'),
      title: t('tour.credits_title'),
    },
    {
      target: '.tour-stats',
      content: t('tour.stats_content'),
      title: t('tour.stats_title'),
    },
    {
      target: '.tour-create-server',
      content: t('tour.create_content'),
      title: t('tour.create_title'),
    }
  ];

  const handleJoyrideCallback = async (data) => {
    const { status } = data;
    const finishedStatuses = [STATUS.FINISHED, STATUS.SKIPPED];

    if (finishedStatuses.includes(status)) {
      if (userId) {
        // Mark tutorial as completed in DB
        await supabase
            .from('profiles')
            .update({ tutorial_completed: true })
            .eq('id', userId);
      }
      if (onFinish) onFinish();
    }
  };

  if (!isMounted) return null;

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      showProgress
      showSkipButton
      callback={handleJoyrideCallback}
      styles={{
        options: {
          primaryColor: '#4f46e5', // Matches indigo-600
          zIndex: 10000,
          arrowColor: '#fff',
          backgroundColor: '#fff',
          textColor: '#333',
        },
      }}
    />
  );
}