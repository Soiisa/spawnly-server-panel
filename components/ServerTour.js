// components/ServerTour.js
import { useState, useEffect } from 'react';
import Joyride, { STATUS } from 'react-joyride';
import { useTranslation } from 'next-i18next';
import { supabase } from '../lib/supabaseClient';

export default function ServerTour({ run, userId, onFinish }) {
  const { t } = useTranslation('server');
  const [isMounted, setIsMounted] = useState(false);

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
    // --- ADDED: Header Step ---
    {
      target: '.tour-main-header',
      content: t('tour.header_content'),
      title: t('tour.header_title'),
      placement: 'bottom',
    },
    {
      target: '.tour-status-indicator',
      content: t('tour.status_content'),
      title: t('tour.status_title'),
    },
    {
      target: '.tour-server-address',
      content: t('tour.address_content'),
      title: t('tour.address_title'),
    },
    {
      target: '.tour-server-controls',
      content: t('tour.controls_content'),
      title: t('tour.controls_title'),
    },
    {
      target: '.tour-server-resources',
      content: t('tour.resources_content'),
      title: t('tour.resources_title'),
    },
    {
      target: '.tour-server-tabs',
      content: t('tour.tabs_content'),
      title: t('tour.tabs_title'),
    },
    {
      target: '.tour-tab-console',
      content: t('tour.console_content'),
      title: t('tour.console_title'),
    },
    {
      target: '.tour-tab-files',
      content: t('tour.files_content'),
      title: t('tour.files_title'),
    },
    {
      target: '.tour-tab-software',
      content: t('tour.software_content'),
      title: t('tour.software_title'),
    },
    {
      target: '.tour-tab-mods',
      content: t('tour.mods_content'),
      title: t('tour.mods_title'),
    },
    {
      target: '.tour-tab-world',
      content: t('tour.world_content'),
      title: t('tour.world_title'),
    },
    {
      target: '.tour-tab-players',
      content: t('tour.players_content'),
      title: t('tour.players_title'),
    },
    {
      target: '.tour-tab-backups',
      content: t('tour.backups_content'),
      title: t('tour.backups_title'),
    },
    {
      target: '.tour-tab-schedules',
      content: t('tour.schedules_content'),
      title: t('tour.schedules_title'),
    },
    {
      target: '.tour-tab-properties',
      content: t('tour.properties_content'),
      title: t('tour.properties_title'),
    },
    {
      target: '.tour-tab-access',
      content: t('tour.access_content'),
      title: t('tour.access_title'),
    },
    {
      target: '.tour-billing-card',
      content: t('tour.billing_content'),
      title: t('tour.billing_title'),
      placement: 'top',
    }
  ];

  const handleJoyrideCallback = async (data) => {
    const { status } = data;
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
      if (userId) {
        await supabase
            .from('profiles')
            .update({ server_tour_completed: true })
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
          primaryColor: '#4f46e5',
          zIndex: 10000,
          arrowColor: '#fff',
          backgroundColor: '#fff',
          textColor: '#333',
        },
      }}
    />
  );
}