import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>();
  return {
    ...actual,
    apiRequest: vi.fn(),
    trainingPartnersApi: { ...actual.trainingPartnersApi, getAll: vi.fn() },
    trainingProposalsApi: { ...actual.trainingProposalsApi, getAll: vi.fn() },
    trainingSettingsApi: { ...actual.trainingSettingsApi, getAll: vi.fn() },
    executorsApi: { ...actual.executorsApi, getAll: vi.fn() },
  };
});

import { NotepadPage } from '../NotepadPage';
import { ColleaguesSection } from '../ColleaguesSection';
import TrainingsPage from '../TrainingsPage';
import {
  apiRequest,
  executorsApi,
  trainingPartnersApi,
  trainingProposalsApi,
  trainingSettingsApi,
} from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useExecutorStore } from '../../stores/executorStore';
import { useLanguageStore } from '../../stores/languageStore';
import { useTrainingStore } from '../../stores/trainingStore';

const projectedProposal = {
  id: 'proposal-1',
  topic: 'Безопасная работа с электрооборудованием',
  description: 'Практический тренинг',
  author_id: null,
  author_name: null,
  is_author_anonymous: 0,
  partner_id: 'partner-1',
  partner_name: 'Tashkent Safety Lab',
  format: 'offline',
  preferred_time_slots: [],
  votes: [{
    id: 'vote-1', proposal_id: 'proposal-1', voter_id: 'resident-1', voter_name: 'Resident',
    participation_intent: 'definitely', is_anonymous: 0, voted_at: '2026-08-15T12:00:00.000Z',
  }],
  vote_threshold: 5,
  status: 'scheduled',
  scheduled_date: '2026-08-25',
  scheduled_time: '12:00',
  scheduled_location: 'Технический центр Mirzo',
  max_participants: 24,
  registrations: [{ user_id: 'resident-1' }],
  feedback: [],
  created_at: '2026-07-19T12:00:00.000Z',
  updated_at: '2026-07-19T12:00:00.000Z',
  vote_count: 1,
  registered_count: 1,
};

describe('demo engagement page visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useLanguageStore.setState({ language: 'ru' });
    useAuthStore.setState({
      user: { id: 'manager-1', login: 'demo-manager', name: 'Demo Manager', role: 'manager' } as any,
      token: 'demo-token', isLoading: false, error: null,
    });
    useTrainingStore.setState({
      partners: [], proposals: [], notifications: [],
      settings: {
        voteThreshold: 5, allowAnonymousProposals: true, allowAnonymousVotes: true,
        allowAnonymousFeedback: true, notifyAllOnNewProposal: false, autoCloseAfterDays: 30,
      },
      isLoadingPartners: false, isLoadingProposals: false, isLoadingNotifications: false,
    });
    useExecutorStore.setState({ executors: [], isLoadingExecutors: false, executorsError: null });
  });

  it('loads and renders seeded training proposals on mount', async () => {
    vi.mocked(trainingPartnersApi.getAll).mockResolvedValue({ partners: [{ id: 'partner-1', name: 'Tashkent Safety Lab', is_active: 1 }] });
    vi.mocked(trainingProposalsApi.getAll).mockResolvedValue({ proposals: [projectedProposal] });
    vi.mocked(trainingSettingsApi.getAll).mockResolvedValue({ settings: {
      vote_threshold: 5, allow_anonymous_proposals: true, allow_anonymous_votes: true,
      allow_anonymous_feedback: true, notify_all_on_new_proposal: false, auto_close_after_days: 30,
    } });

    render(<TrainingsPage />);

    expect(await screen.findByText('Безопасная работа с электрооборудованием')).toBeInTheDocument();
    expect(screen.getByText(/Tashkent Safety Lab/)).toBeInTheDocument();
    expect(trainingProposalsApi.getAll).toHaveBeenCalledTimes(1);
  });

  it('renders persisted executor ratings without random presentation drift', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.mocked(executorsApi.getAll).mockResolvedValue({
      executors: [{
        id: 'executor-1', login: 'demo-executor', name: 'Demo Plumber', phone: '+998901200040',
        specialization: 'plumber', status: 'available',
        rating: 4.7, completed_count: 12, active_requests: 1, total_earnings: 0,
        avg_completion_time: 35, created_at: '2026-01-01T00:00:00.000Z',
      }],
    });

    render(<ColleaguesSection />);

    expect(await screen.findAllByText('Demo Plumber')).not.toHaveLength(0);
    await waitFor(() => expect(screen.getAllByText('4.7').length).toBeGreaterThan(0));
    random.mockRestore();
  });

  it('renders the authenticated user private notes returned by the API', async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      if (path === '/api/notes') return { notes: [{
        id: 'note-1', title: 'Приоритеты недели', content: 'Проверить открытые заявки',
        created_at: '2026-08-18T08:00:00.000Z', updated_at: '2026-08-18T08:00:00.000Z',
      }] } as any;
      throw new Error(`Unexpected API path ${path}`);
    });

    render(<NotepadPage />);

    expect(await screen.findByText('Приоритеты недели')).toBeInTheDocument();
    expect(screen.getByText('Проверить открытые заявки')).toBeInTheDocument();
  });
});
