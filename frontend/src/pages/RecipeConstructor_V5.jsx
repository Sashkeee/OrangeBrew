import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, InputNumber, Select, Button, Card, Divider, Row, Col, Space, Typography, Layout, Popconfirm, Statistic } from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowLeftOutlined, SaveOutlined, PlayCircleOutlined, ExperimentOutlined, FireOutlined, AppstoreOutlined } from '@ant-design/icons';
import { recipesApi, sessionsApi } from '../api/client.js';
import { DEFAULT_HOPS, DEFAULT_MALTS, DEFAULT_YEASTS, getIngredientsFromStorage } from '../utils/ingredients';

const { Title, Text } = Typography;
const { Content } = Layout;

export default function RecipeConstructor_V5() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  
  const [dictionary, setDictionary] = useState({ malt: [], hop: [], yeast: [] });

  useEffect(() => {
    const custom = getIngredientsFromStorage();
    setDictionary({
      malt: [...DEFAULT_MALTS, ...custom.malt],
      hop: [...DEFAULT_HOPS, ...custom.hop],
      yeast: [...DEFAULT_YEASTS, ...custom.yeast]
    });
    
    // Initializing Form Values
    form.setFieldsValue({
      name: '', style: '', batch_size: 40, boil_time: 60,
      mash_steps: [{ name: 'Пауза осахаривания', temp: 62, duration: 60 }],
      ingredients: [], hop_additions: []
    });
  }, [form]);

  const handleSave = async (values, start = false) => {
    try {
      setSaving(true);
      const created = await recipesApi.create(values);
      localStorage.setItem('currentRecipe', JSON.stringify({ ...created, steps: values.mash_steps }));
      if (start) {
        const session = await sessionsApi.create({ recipe_id: created.id, type: 'brewing', status: 'active' });
        navigate(`/brewing/mash/${session.id}`);
      } else navigate('/brewing/recipes');
    } catch (e) { alert('Ошибка: ' + e.message); } finally { setSaving(false); }
  };

  return (
    <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Content style={{ padding: '40px 20px', maxWidth: 900, margin: '0 auto', width: '100%' }}>
        <Space align="center" style={{ marginBottom: 24 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/brewing')} />
          <Title level={2} style={{ margin: 0 }}>
            Конструктор Рецептов <Text type="danger">V5 (Ant Design)</Text>
          </Title>
        </Space>

        <Form 
          form={form} 
          layout="vertical" 
          onFinish={(values) => handleSave(values, false)}
          initialValues={{ batch_size: 40, boil_time: 60 }}
        >
          {/* Basic Params */}
          <Card title={<><AppstoreOutlined /> Основная информация</>} bordered={false} style={{ marginBottom: 24, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item name="name" label="Название рецепта" rules={[{ required: true, message: 'Обязательное поле' }]}>
                  <Input placeholder="Введите название" size="large" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="style" label="Стиль">
                  <Input placeholder="Например: IPA" size="large" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={12}>
                <Form.Item name="batch_size" label="Объем (литров)">
                  <InputNumber style={{ width: '100%' }} size="large" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={12}>
                <Form.Item name="boil_time" label="Кипячение (мин)">
                  <InputNumber style={{ width: '100%' }} size="large" />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* Mash Steps */}
          <Card title={<><FireOutlined style={{color: '#fa541c'}} /> Затирание</>} bordered={false} style={{ marginBottom: 24, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <Form.List name="mash_steps">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }, idx) => (
                    <div key={key} style={{ background: '#fafafa', padding: 16, marginBottom: 16, borderRadius: 8, position: 'relative', border: '1px solid #f0f0f0' }}>
                      <Text strong style={{ color: '#8c8c8c', marginBottom: 12, display: 'block' }}>ШАГ {idx + 1}</Text>
                      <Row gutter={16}>
                        <Col xs={24} sm={10}>
                          <Form.Item {...restField} name={[name, 'name']} label="Название паузы" rules={[{ required: true, message: 'Укажите название' }]}>
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col xs={12} sm={7}>
                          <Form.Item {...restField} name={[name, 'temp']} label="Темп (°C)">
                            <InputNumber style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                        <Col xs={12} sm={7}>
                          <Form.Item {...restField} name={[name, 'duration']} label="Время (мин)">
                            <InputNumber style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                      </Row>
                      {fields.length > 1 && (
                        <Button 
                          type="text" danger icon={<DeleteOutlined />} 
                          style={{ position: 'absolute', top: 12, right: 12 }} 
                          onClick={() => remove(name)} 
                        />
                      )}
                    </div>
                  ))}
                  <Button type="dashed" onClick={() => add({ name: 'Новая пауза', temp: 72, duration: 15 })} block icon={<PlusOutlined />}>
                    Добавить шаг затирания
                  </Button>
                </>
              )}
            </Form.List>
          </Card>

          {/* Action Buttons */}
          <Row gutter={16} style={{ marginTop: 32 }}>
            <Col xs={12}>
              <Button size="large" block icon={<SaveOutlined />} onClick={() => form.submit()} loading={saving}>
                Сохранить
              </Button>
            </Col>
            <Col xs={12}>
              <Button size="large" block type="primary" icon={<PlayCircleOutlined />} onClick={() => {
                form.validateFields().then(values => handleSave(values, true));
              }} loading={saving}>
                В варку!
              </Button>
            </Col>
          </Row>
        </Form>
      </Content>
    </Layout>
  );
}
