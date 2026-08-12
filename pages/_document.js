import Document, { Html, Head, Main, NextScript } from 'next/document';

class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const initialProps = await Document.getInitialProps(ctx);
    return { ...initialProps, locale: ctx.locale || 'en' };
  }

  render() {
    return (
      <Html lang={this.props.locale}>
        <Head>
          <link rel="icon" href="/favicon.ico" />
          <meta name="theme-color" content="#2563eb" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
