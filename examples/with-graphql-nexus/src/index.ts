import 'dotenv/config';
import { app } from './app';

const port = Number.parseInt(process.env.PORT ?? '', 10) || 4001;

app.listen(port, () => console.log(`Listening on http://localhost:${port}/`));
