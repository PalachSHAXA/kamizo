import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  RefreshControl,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Employee } from '../types';
import { colleaguesAPI } from '../api/client';

const CRITERIA_LABELS = {
  professionalKnowledge: 'Профессиональные знания',
  legislationKnowledge: 'Знание законодательства',
  analyticalSkills: 'Аналитические способности',
  qualityOfWork: 'Качество работы',
  execution: 'Исполнительность',
  reliability: 'Надёжность',
  teamwork: 'Командность',
  communication: 'Коммуникация',
  initiative: 'Инициативность',
  humanity: 'Человечность',
};

const THANK_REASONS = [
  'Помог с задачей',
  'Поддержал в сложный момент',
  'Научил чему-то новому',
  'Выручил в дедлайн',
  'Просто спасибо',
];

// Моковые данные
const MOCK_EMPLOYEES: Employee[] = [
  {
    id: 1,
    name: 'Алексей Иванов',
    position: 'Senior Developer',
    department: 'IT',
    photo: 'https://i.pravatar.cc/150?img=12',
    ratings: {
      professionalKnowledge: 4.7,
      legislationKnowledge: 4.2,
      analyticalSkills: 4.8,
      qualityOfWork: 4.6,
      execution: 4.5,
      reliability: 4.7,
      teamwork: 4.9,
      communication: 4.6,
      initiative: 4.3,
      humanity: 4.8,
    },
    totalRatings: 48,
    monthlyRatings: 5,
    badges: ['Командный игрок'],
  },
  {
    id: 2,
    name: 'Мария Петрова',
    position: 'HR Manager',
    department: 'HR',
    photo: 'https://i.pravatar.cc/150?img=5',
    ratings: {
      professionalKnowledge: 4.5,
      legislationKnowledge: 4.8,
      analyticalSkills: 4.3,
      qualityOfWork: 4.7,
      execution: 4.6,
      reliability: 4.8,
      teamwork: 4.7,
      communication: 4.9,
      initiative: 4.4,
      humanity: 5.0,
    },
    totalRatings: 52,
    monthlyRatings: 6,
    badges: ['Человечность'],
  },
];

const StarRating: React.FC<{ rating: number; size?: number }> = ({ rating, size = 16 }) => {
  return (
    <View style={styles.starsContainer}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Text key={star} style={{ fontSize: size }}>
          {star <= Math.floor(rating) ? '⭐' : '☆'}
        </Text>
      ))}
    </View>
  );
};

export const ColleaguesScreen = () => {
  const [employees, setEmployees] = useState<Employee[]>(MOCK_EMPLOYEES);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showThankModal, setShowThankModal] = useState(false);
  const [ratedEmployees, setRatedEmployees] = useState<Set<number>>(new Set());

  const [currentRatings, setCurrentRatings] = useState<any>({});
  const [selectedThankReason, setSelectedThankReason] = useState(THANK_REASONS[0]);

  const loadEmployees = async () => {
    try {
      // В реальном приложении загрузка с сервера
      // const data = await colleaguesAPI.getAll();
      // setEmployees(data);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить список коллег');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadEmployees();
    setRefreshing(false);
  };

  const handleRate = (employee: Employee) => {
    setSelectedEmployee(employee);
    setCurrentRatings({});
    setShowRatingModal(true);
  };

  const handleThank = (employee: Employee) => {
    setSelectedEmployee(employee);
    setShowThankModal(true);
  };

  const submitRating = async () => {
    const allRated = Object.keys(currentRatings).length === 10;
    if (!allRated) {
      Alert.alert('Внимание', 'Пожалуйста, оцените все критерии');
      return;
    }

    try {
      // await colleaguesAPI.rate(selectedEmployee!.id, currentRatings);
      setRatedEmployees(new Set([...ratedEmployees, selectedEmployee!.id]));
      setShowRatingModal(false);
      Alert.alert('Успех', 'Оценка отправлена');
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось отправить оценку');
    }
  };

  const submitThank = async () => {
    try {
      // await colleaguesAPI.thank(selectedEmployee!.id, selectedThankReason, false);
      setShowThankModal(false);
      Alert.alert('Успех', 'Благодарность отправлена');
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось отправить благодарность');
    }
  };

  const avgRating = (emp: Employee) => {
    const values = Object.values(emp.ratings);
    return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
  };

  const renderEmployee = ({ item }: { item: Employee }) => {
    const isRated = ratedEmployees.has(item.id);

    return (
      <Card style={styles.employeeCard}>
        <TouchableOpacity onPress={() => setSelectedEmployee(item)}>
          <View style={styles.employeeHeader}>
            <Image source={{ uri: item.photo }} style={styles.avatar} />
            <View style={styles.employeeInfo}>
              <Text style={styles.employeeName}>{item.name}</Text>
              <Text style={styles.employeePosition}>{item.position}</Text>
              <View style={styles.ratingRow}>
                <StarRating rating={parseFloat(avgRating(item))} />
                <Text style={styles.ratingText}>{avgRating(item)}</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.buttonsRow}>
          <Button
            title={isRated ? '✓ Оценено' : 'Оценить'}
            onPress={() => handleRate(item)}
            disabled={isRated}
            variant={isRated ? 'outline' : 'primary'}
            style={styles.actionButton}
          />
          <Button
            title="❤️ Спасибо"
            onPress={() => handleThank(item)}
            variant="outline"
            style={styles.actionButton}
          />
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Мои коллеги</Text>

      <FlatList
        data={employees}
        renderItem={renderEmployee}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />

      {/* Rating Modal */}
      <Modal visible={showRatingModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Оценить: {selectedEmployee?.name}
            </Text>
            <Text style={styles.modalSubtitle}>🔒 Оценка анонимна</Text>

            <ScrollView style={styles.criteriaList}>
              {Object.entries(CRITERIA_LABELS).map(([key, label]) => (
                <View key={key} style={styles.criteriaItem}>
                  <Text style={styles.criteriaLabel}>{label}</Text>
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <TouchableOpacity
                        key={star}
                        onPress={() =>
                          setCurrentRatings({ ...currentRatings, [key]: star })
                        }
                      >
                        <Text style={styles.starButton}>
                          {currentRatings[key] >= star ? '⭐' : '☆'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalButtons}>
              <Button
                title="Отмена"
                onPress={() => setShowRatingModal(false)}
                variant="outline"
                style={styles.modalButton}
              />
              <Button
                title="Отправить"
                onPress={submitRating}
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Thank Modal */}
      <Modal visible={showThankModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Поблагодарить: {selectedEmployee?.name}
            </Text>

            <Text style={styles.inputLabel}>За что спасибо?</Text>
            {THANK_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason}
                style={[
                  styles.reasonOption,
                  selectedThankReason === reason && styles.reasonOptionSelected,
                ]}
                onPress={() => setSelectedThankReason(reason)}
              >
                <Text
                  style={[
                    styles.reasonText,
                    selectedThankReason === reason && styles.reasonTextSelected,
                  ]}
                >
                  {reason}
                </Text>
              </TouchableOpacity>
            ))}

            <View style={styles.modalButtons}>
              <Button
                title="Отмена"
                onPress={() => setShowThankModal(false)}
                variant="outline"
                style={styles.modalButton}
              />
              <Button
                title="Отправить"
                onPress={submitThank}
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    padding: 16,
    color: '#1F2937',
  },
  list: {
    padding: 16,
  },
  employeeCard: {
    marginBottom: 12,
  },
  employeeHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 12,
  },
  employeeInfo: {
    marginLeft: 12,
    flex: 1,
  },
  employeeName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  employeePosition: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  starsContainer: {
    flexDirection: 'row',
  },
  ratingText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#F59E0B',
    marginBottom: 16,
  },
  criteriaList: {
    maxHeight: 400,
  },
  criteriaItem: {
    marginBottom: 16,
  },
  criteriaLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  starButton: {
    fontSize: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  modalButton: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  reasonOption: {
    padding: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    marginBottom: 8,
  },
  reasonOptionSelected: {
    backgroundColor: '#FEF3C7',
  },
  reasonText: {
    fontSize: 14,
    color: '#374151',
  },
  reasonTextSelected: {
    color: '#92400E',
    fontWeight: '600',
  },
});
