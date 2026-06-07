/**
 * Predictive Analytics & Proactivity Engine
 * 
 * Реализует Пункт 6: Система предсказания потребностей
 * - Predict Needs: Предсказание на основе паттернов
 * - Detect Anomalies: Обнаружение аномалий
 * - Generate Suggestions: Автоматические рекомендации
 * - Preemptive Actions: Упреждающие действия
 */

import { z } from 'zod';
import { AgentMemory } from '../memory/agent-memory';
import { Logger } from '../utils/logger';

const logger = new Logger('PredictiveEngine');

// Схемы данных
const ActivityPatternSchema = z.object({
  userId: z.string(),
  actionType: z.string(),
  hourOfDay: z.number().min(0).max(23),
  dayOfWeek: z.number().min(0).max(6),
  frequency: z.number(),
  lastOccurrence: z.number(), // timestamp
  confidence: z.number().min(0).max(1),
});

const AnomalySchema = z.object({
  type: z.enum(['TIME', 'FREQUENCY', 'VALUE', 'BEHAVIOR']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  description: z.string(),
  detectedAt: z.number(),
  baseline: z.any(),
  actualValue: z.any(),
  deviationScore: z.number(),
});

const PredictionSchema = z.object({
  targetAction: z.string(),
  probability: z.number().min(0).max(1),
  estimatedTime: z.number(), // timestamp
  reasoning: z.string(),
  requiredResources: z.array(z.string()).optional(),
});

const SuggestionSchema = z.object({
  id: z.string(),
  type: z.enum(['OPTIMIZATION', 'SECURITY', 'EFFICIENCY', 'NEW_FEATURE']),
  title: z.string(),
  description: z.string(),
  impactScore: z.number().min(1).max(10),
  implementationSteps: z.array(z.string()),
});

export type ActivityPattern = z.infer<typeof ActivityPatternSchema>;
export type Anomaly = z.infer<typeof AnomalySchema>;
export type Prediction = z.infer<typeof PredictionSchema>;
export type Suggestion = z.infer<typeof SuggestionSchema>;

export class PredictiveEngine {
  private patterns: Map<string, ActivityPattern[]> = new Map();
  private baselines: Map<string, any> = new Map();
  private suggestionQueue: Suggestion[] = [];

  constructor(private memory: AgentMemory) {}

  /**
   * 📈 Predict Needs: Анализ исторических данных для предсказания следующих действий
   */
  async predictNeeds(userId: string, context: Record<string, any>): Promise<Prediction[]> {
    logger.info(`Generating predictions for user ${userId}`);
    
    const userPatterns = this.patterns.get(userId) || [];
    const currentHour = new Date().getHours();
    const currentDay = new Date().getDay();

    if (userPatterns.length === 0) {
      await this.learnPatterns(userId);
    }

    const relevantPatterns = userPatterns.filter(p => 
      Math.abs(p.hourOfDay - currentHour) <= 2 && 
      p.dayOfWeek === currentDay
    );

    const predictions: Prediction[] = [];

    for (const pattern of relevantPatterns) {
      if (pattern.confidence > 0.7) {
        predictions.push({
          targetAction: pattern.actionType,
          probability: pattern.confidence,
          estimatedTime: Date.now() + 3600000, // +1 час
          reasoning: `Based on historical pattern: ${pattern.frequency} occurrences at this time`,
          requiredResources: this.getResourcesForAction(pattern.actionType)
        });
      }
    }

    return predictions;
  }

  /**
   * 🚨 Detect Anomalies: Выявление отклонений от нормального поведения
   */
  async detectAnomalies(userId: string, currentActivity: any): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];
    const baseline = this.baselines.get(userId);

    if (!baseline) {
      await this.establishBaseline(userId);
      return [];
    }

    // Проверка временных аномалий
    if (currentActivity.timestamp) {
      const hour = new Date(currentActivity.timestamp).getHours();
      const expectedHours = baseline.activeHours || [];
      
      if (!expectedHours.includes(hour) && expectedHours.length > 0) {
        anomalies.push({
          type: 'TIME',
          severity: 'MEDIUM',
          description: `Activity detected at unusual hour: ${hour}`,
          detectedAt: Date.now(),
          baseline: { activeHours: expectedHours },
          actualValue: hour,
          deviationScore: this.calculateDeviation(hour, expectedHours)
        });
      }
    }

    // Проверка частоты действий
    if (currentActivity.actionType) {
      const actionCount = currentActivity.count || 1;
      const expectedMax = baseline.maxActionsPerHour?.[currentActivity.actionType] || 10;
      
      if (actionCount > expectedMax * 2) {
        anomalies.push({
          type: 'FREQUENCY',
          severity: 'HIGH',
          description: `Unusual frequency for ${currentActivity.actionType}: ${actionCount} vs expected ${expectedMax}`,
          detectedAt: Date.now(),
          baseline: { maxExpected: expectedMax },
          actualValue: actionCount,
          deviationScore: (actionCount - expectedMax) / expectedMax
        });
      }
    }

    // Логирование и возврат
    if (anomalies.length > 0) {
      logger.warn(`Detected ${anomalies.length} anomalies for user ${userId}`);
      await this.logAnomalies(userId, anomalies);
    }

    return anomalies;
  }

  /**
   * 💡 Generate Suggestions: Генерация рекомендаций по оптимизации
   */
  async generateSuggestions(userId: string): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];
    const patterns = this.patterns.get(userId) || [];

    // Анализ повторяющихся ошибок
    const errorPatterns = patterns.filter(p => p.actionType.includes('ERROR') || p.actionType.includes('FAIL'));
    if (errorPatterns.length > 3) {
      suggestions.push({
        id: `sugg-${Date.now()}-1`,
        type: 'EFFICIENCY',
        title: 'Обнаружен цикл повторяющихся ошибок',
        description: `Зафиксировано ${errorPatterns.length} типов повторяющихся сбоев. Рекомендуется пересмотреть стратегию выполнения.`,
        impactScore: 8,
        implementationSteps: [
          'Анализировать логи ошибок',
          'Активировать режим отладки',
          'Предложить альтернативный подход'
        ]
      });
    }

    // Анализ неиспользуемых ресурсов
    suggestions.push({
      id: `sugg-${Date.now()}-2`,
      type: 'OPTIMIZATION',
      title: 'Оптимизация расписания задач',
      description: 'На основе паттернов активности можно перенести тяжелые задачи на ночное время.',
      impactScore: 6,
      implementationSteps: [
        'Сдвинуть задачи бэкапа на 03:00',
        'Увеличить лимиты на ночные операции',
        'Снизить приоритет дневных фоновых задач'
      ]
    });

    this.suggestionQueue = [...this.suggestionQueue, ...suggestions];
    return suggestions;
  }

  /**
   * ⏰ Preemptive Actions: Автоматическое выполнение упреждающих действий
   */
  async executePreemptiveActions(predictions: Prediction[]): Promise<void> {
    const highConfidence = predictions.filter(p => p.probability > 0.85);

    for (const prediction of highConfidence) {
      logger.info(`Preemptive action triggered: ${prediction.targetAction}`);
      
      // Здесь должна быть интеграция с Executor
      // Пример: предварительная загрузка данных, кэширование, прогрев соединений
      await this.prepareForAction(prediction);
    }
  }

  // --- Внутренние методы ---

  private async learnPatterns(userId: string): Promise<void> {
    // Извлечение данных из памяти за последние 30 дней
    const history = await this.memory.getEvents({ userId, limit: 1000 });
    const patterns: ActivityPattern[] = [];

    // Простая агрегация (в реальности использовать ML модель)
    const aggregation: Record<string, any> = {};
    
    for (const event of history) {
      const key = `${event.type}-${new Date(event.timestamp).getHours()}`;
      if (!aggregation[key]) {
        aggregation[key] = { count: 0, hours: [] };
      }
      aggregation[key].count++;
      aggregation[key].hours.push(new Date(event.timestamp).getHours());
    }

    // Преобразование в паттерны
    Object.entries(aggregation).forEach(([key, data]: [string, any]) => {
      const [actionType, hourStr] = key.split('-');
      const hour = parseInt(hourStr);
      
      patterns.push({
        userId,
        actionType,
        hourOfDay: hour,
        dayOfWeek: new Date().getDay(), // Упрощение
        frequency: data.count,
        lastOccurrence: Date.now(),
        confidence: Math.min(1, data.count / 100)
      });
    });

    this.patterns.set(userId, patterns);
    logger.info(`Learned ${patterns.length} patterns for user ${userId}`);
  }

  private async establishBaseline(userId: string): Promise<void> {
    // Установка базовых метрик
    this.baselines.set(userId, {
      activeHours: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
      maxActionsPerHour: {
        'MESSAGE_SEND': 50,
        'TRANSACTION': 10,
        'API_CALL': 100
      },
      avgResponseTime: 500
    });
  }

  private calculateDeviation(value: number, expected: number[]): number {
    const avg = expected.reduce((a, b) => a + b, 0) / expected.length;
    return Math.abs(value - avg) / (avg || 1);
  }

  private getResourcesForAction(actionType: string): string[] {
    const resourceMap: Record<string, string[]> = {
      'TRANSACTION': ['wallet', 'gas', 'rpc_node'],
      'MESSAGE_SEND': ['telegram_api', 'rate_limit'],
      'DATA_FETCH': ['http_client', 'cache'],
      'DEFAULT': ['compute', 'memory']
    };
    return resourceMap[actionType] || resourceMap['DEFAULT'];
  }

  private async prepareForAction(prediction: Prediction): Promise<void> {
    // Симуляция подготовки
    logger.debug(`Preparing resources: ${prediction.requiredResources?.join(', ')}`);
    // В реальной системе: предзагрузка данных, проверка балансов, пинг узлов
  }

  private async logAnomalies(userId: string, anomalies: Anomaly[]): Promise<void> {
    await this.memory.saveEvent({
      type: 'ANOMALY_DETECTED',
      userId,
      data: { anomalies },
      timestamp: Date.now(),
      priority: 'HIGH'
    });
  }
}
