import dotenv from 'dotenv';
dotenv.config({ override: true });
import { initLarkClient, getLarkClient } from '../lark/client.js';

initLarkClient({ appId: process.env.LARK_APP_ID!, appSecret: process.env.LARK_APP_SECRET! });
const client = getLarkClient();

async function main() {
  // Try department.list instead of department.children
  console.log('=== Testing department.list ===');
  try {
    const res = await client.contact.department.list({
      params: {
        department_id_type: 'department_id',
        parent_department_id: '0',
        fetch_child: true,
        page_size: 50,
      },
    });
    console.log('code:', res.code, 'msg:', res.msg);
    console.log('items count:', res.data?.items?.length ?? 0);
    if (res.data?.items) {
      for (const d of res.data.items.slice(0, 5)) {
        console.log(' -', d.department_id, d.name, 'parent:', d.parent_department_id);
      }
    }
  } catch (err: any) {
    if (err.response?.data) {
      console.log('list() error:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.log('list() error:', err.message);
    }
  }

  // Also try children
  console.log('\n=== Testing department.children ===');
  try {
    const res = await client.contact.department.children({
      params: {
        department_id_type: 'department_id',
        fetch_child: true,
        page_size: 50,
      },
      path: { department_id: '0' },
    });
    console.log('code:', res.code, 'msg:', res.msg);
    console.log('items count:', res.data?.items?.length ?? 0);
  } catch (err: any) {
    if (err.response?.data) {
      console.log('children() error:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.log('children() error:', err.message);
    }
  }

  // Try getting a specific user to test user scope
  console.log('\n=== Testing user.findByDepartment ===');
  try {
    const res = await client.contact.user.findByDepartment({
      params: {
        user_id_type: 'user_id',
        department_id_type: 'department_id',
        department_id: '0',
        page_size: 10,
      },
    });
    console.log('code:', res.code, 'msg:', res.msg);
    console.log('items count:', res.data?.items?.length ?? 0);
    if (res.data?.items) {
      for (const u of res.data.items.slice(0, 3)) {
        console.log(' -', u.user_id, u.name, u.email);
      }
    }
  } catch (err: any) {
    if (err.response?.data) {
      console.log('findByDepartment() error:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.log('findByDepartment() error:', err.message);
    }
  }
}

main();
