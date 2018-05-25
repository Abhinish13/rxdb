/**
 * this checks if typings work as expected
 */
import assert from 'assert';
import * as schemas from './../helper/schemas';
import config from './config';

describe('typings.test.js', () => {
    const codeBase = `
        import {
            create,
            RxDatabase,
            RxDatabaseCreator,
            RxCollection,
            RxCollectionCreator,
            RxDocument,
            RxJsonSchema,
            RxError,
            RxAttachment,
            RxPlugin,
            plugin
        } from '../';
        import * as PouchMemAdapter from 'pouchdb-adapter-memory';
        plugin(PouchMemAdapter);
    `;
    const transpileCode = async (code) => {
        const spawn = require('child-process-promise').spawn;
        const stdout = [];
        const stderr = [];
        const promise = spawn('ts-node', [
            '--no-cache',
            '--compilerOptions', '{"target":"es6", "strict": true, "strictNullChecks": true}',
            '--type-check',
            '-p', code
        ]);
        const childProcess = promise.childProcess;
        childProcess.stdout.on('data', data => stdout.push(data.toString()));
        childProcess.stderr.on('data', data => stderr.push(data.toString()));
        try {
            await promise;
        } catch (err) {
            throw new Error(`could not run
                # Error: ${err}
                # Output: ${stdout}
                # ErrOut: ${stderr}
                `);
        }
    };

    config.parallel('basic', () => {
        it('should sucess on basic test', async () => {
            await transpileCode('console.log("Hello, world!")');
        });
        it('should fail on broken code', async () => {
            const brokenCode = `
                let x: string = 'foo';
                x = 1337;
            `;
            let thrown = false;
            try {
                await transpileCode(brokenCode);
            } catch (err) {
                thrown = true;
            }
            assert.ok(thrown);
        });
    });
    config.parallel('import', () => {
        it('import default with strict:true', async () => {
            const code = `
                import rxdb from '../';
                import * as PouchMemAdapter from 'pouchdb-adapter-memory';
                rxdb.plugin(PouchMemAdapter);
            `;
            await transpileCode(code);
        });
    });
    config.parallel('database', () => {
        describe('positive', () => {
            it('should create the database', async () => {
                const code = codeBase + `
                    (async() => {
                        const databaseCreator: RxDatabaseCreator = {
                            name: 'mydb',
                            adapter: 'memory',
                            multiInstance: false,
                            ignoreDuplicate: false
                        };
                        const myDb: RxDatabase = await create(databaseCreator);
                    })();
                `;
                await transpileCode(code);
            });
        });
        describe('negative', () => {
            it('should not allow additional parameters', async () => {
                const brokenCode = `
                    const databaseCreator: RxDatabaseCreator = {
                        name: 'mydb',
                        adapter: 'memory',
                        multiInstance: false,
                        ignoreDuplicate: false,
                        foo: 'bar'
                    };
                `;
                let thrown = false;
                try {
                    await transpileCode(brokenCode);
                } catch (err) {
                    thrown = true;
                }
                assert.ok(thrown);
            });
        });
    });
    describe('collection', () => {
        config.parallel('positive', () => {
            it('collection-creation', async () => {
                const code = codeBase + `
                    (async() => {
                        const myDb: RxDatabase = await create({
                            name: 'mydb',
                            adapter: 'memory',
                            multiInstance: false,
                            ignoreDuplicate: false
                        });
                        const mySchema: RxJsonSchema = ${JSON.stringify(schemas.human)};
                        const myCollection: RxCollection<any> = await myDb.collection({
                            name: 'humans',                            schema: mySchema,
                            autoMigrate: false,
                        });
                    })();
                `;
                await transpileCode(code);
            });
            it('use options', async () => {
                const code = codeBase + `
                    (async() => {
                        const myDb: RxDatabase = await create({
                            name: 'mydb',
                            adapter: 'memory',
                            multiInstance: false,
                            ignoreDuplicate: false,
                            options: {
                                foo1: 'bar1'
                            }
                        });
                        const mySchema: RxJsonSchema = ${JSON.stringify(schemas.human)};
                        const myCollection: RxCollection<any> = await myDb.collection({
                            name: 'humans',                            schema: mySchema,
                            autoMigrate: false,
                            options: {
                                foo2: 'bar2'
                            }
                        });
                        const x: string = myDb.options.foo1;
                        const y: string = myCollection.options.foo2;
                    })();
                `;
                await transpileCode(code);
            });
            it('use underlaying pouchdb', async () => {
                const code = codeBase + `
                    (async() => {
                        const myDb: RxDatabase = await create({
                            name: 'mydb',
                            adapter: 'memory',
                            multiInstance: false,
                            ignoreDuplicate: false,
                            options: {
                                foo1: 'bar1'
                            }
                        });
                        const mySchema: RxJsonSchema = ${JSON.stringify(schemas.human)};
                        type docType = {
                                foo: string
                        };
                        const myCollection: RxCollection<docType> = await myDb.collection({
                            name: 'humans',                            schema: mySchema,
                            autoMigrate: false,
                            options: {
                                foo2: 'bar2'
                            }
                        });
                        const result = await myCollection.pouch.put({
                            _id: 'foobar',
                            foo: 'bar'
                        });
                        const docs = await myCollection.pouch.allDocs();
                    })();
                `;
                await transpileCode(code);
            });
        });
        config.parallel('negative', () => {
            it('should not allow wrong collection-settings', async () => {
                const brokenCode = codeBase + `
                    (async() => {
                        const myDb: RxDatabase = await create({
                            name: 'mydb',
                            adapter: 'memory',
                            multiInstance: false,
                            ignoreDuplicate: false
                        });
                        const mySchema: RxJsonSchema = ${JSON.stringify(schemas.human)};
                        const myCollection: RxCollection<any> = await myDb.collection({
                            name: 'humans',
                            schema: {}, // wrong schema format
                            autoMigrate: false,
                        });
                    })();
                `;
                let thrown = false;
                try {
                    await transpileCode(brokenCode);
                } catch (err) {
                    thrown = true;
                }
                assert.ok(thrown);
            });
        });
    });
    describe('change-event', () => {
        it('.insert$ .update$ .remove$', async () => {
            const code = codeBase + `
                (async() => {
                    const myDb: RxDatabase = await create({
                        name: 'mydb',
                        adapter: 'memory',
                        multiInstance: false,
                        ignoreDuplicate: false
                    });
                    type docType = {
                        firstName: string,
                        lastName: string
                    }
                    const mySchema: RxJsonSchema = ${JSON.stringify(schemas.human)};
                    const myCollection: RxCollection<docType> = await myDb.collection({
                        name: 'humans',
                        schema: mySchema,
                        autoMigrate: false,
                    });

                    const names: string[] = [];
                    const revs: string[] = [];
                    const sub1 = myCollection.insert$.subscribe(cE => {
                        names.push(cE.data.v.firstName);
                        revs.push(cE.data.v._rev);
                    });
                })();
            `;
            await transpileCode(code);
        });
    });
    config.parallel('document', () => {
        it('should know the fields of the document', async () => {
            const code = codeBase + `
                (async() => {
                    const myDb: any = {};

                    type DocType = {
                        age: number,
                        firstName: string,
                        lastName: string,
                        passportId: string
                    };

                    const myCollection: RxCollection<DocType> = await myDb.collection({
                        name: 'humans',
                        schema: {},
                        autoMigrate: false,
                    });

                    const result = await myCollection.findOne().exec();
                    if(result === null) throw new Error('got no document');
                    const oneDoc: RxDocument<DocType> = result;
                    const id: string = oneDoc.passportId;
                    const prim: string = oneDoc.primary;

                    const otherResult = await myCollection.findOne().exec();
                    if(otherResult === null) throw new Error('got no other document');
                    const otherDoc: RxDocument<DocType> = otherResult;
                    const id2 = otherDoc.passportId;
                });
            `;
            await transpileCode(code);
        });
        it('.putAttachment()', async () => {
            const code = codeBase + `
                (async() => {
                    const myDb: any = {};

                    type DocType = {
                        age: number,
                        firstName: string,
                        lastName: string,
                        passportId: string
                    };

                    const myCollection: RxCollection<DocType> = await myDb.collection({
                        name: 'humans',
                        schema: {},
                        autoMigrate: false,
                    });

                    const result = await myCollection.findOne().exec();
                    if(!result) throw new Error('got no doc');
                    const oneDoc: RxDocument<DocType> = result;
                    const attachment: RxAttachment<DocType> = await oneDoc.putAttachment({
                        id: 'cat.txt',
                        data: 'foo bar',
                        type: 'text/plain'
                    });
                });
            `;
            await transpileCode(code);
        });
        it('.toJSON() should have _rev', async () => {
            const code = codeBase + `
                (async() => {
                    const myDb: any = {};

                    type DocType = {
                        age: number,
                        firstName: string,
                        lastName: string,
                        passportId: string
                    };

                    const myCollection: RxCollection<DocType> = await myDb.collection({
                        name: 'humans',
                        schema: {},
                        autoMigrate: false,
                    });

                    const result = await myCollection.findOne().exec();
                    if(!result) throw new Error('got no doc');
                    const rev: string = result.toJSON()._rev;
                });
            `;
            await transpileCode(code);
        });
    });
    config.parallel('orm', () => {
        it('should correctly recognize orm-methods', async () => {
            const code = codeBase + `
                (async() => {
                    const myDb: any = {};

                    type DocType = {
                        passportId: string;
                        age: number;
                        oneOptional?: string;
                    };

                    type OrmMethods = {
                        foobar(): string;
                    };

                    const myCollection: RxCollection<DocType, OrmMethods> = await myDb.collection({
                        name: 'humans',
                        schema: {},
                        methods: {
                            foobar(){
                                return 'foobar';
                            }
                        }
                    });

                    const doc = await myCollection.insert({
                        passportId: 'asdf',
                        age: 10
                    });

                    const x: string = doc.foobar();

                });
            `;
            await transpileCode(code);
        });
    });
    describe('query', () => {
        it('should know the where-fields', async () => {
            const code = codeBase + `
                (async() => {
                    const myDb: any = {};

                    type DocType = {
                        age: number,
                        firstName: string,
                        lastName: string,
                        passportId: string,
                        nestedObject: {
                            foo: string,
                            bar: number
                        }
                    };

                    const myCollection: RxCollection<DocType> = await myDb.collection({
                        name: 'humans',
                        schema: {},
                        autoMigrate: false,
                    });

                    const query = myCollection.findOne().where('nestedObject.foo').eq('foobar');
                });
            `;
            await transpileCode(code);
        });
    });
    describe('rx-error', () => {
        it('should know the parameters of the error', async () => {
            const code = codeBase + `
                (async() => {
                    const myDb: any = {};
                    const myCollection: RxCollection<any> = await myDb.collection({
                        name: 'humans',
                        schema: {},
                        autoMigrate: false,
                    });

                    try{
                        await myCollection.insert({ age: 4});
                    } catch(err) {
                        if (err.rxdb) {
                            (err as RxError).parameters.errors;
                        } else {
                            // handle regular Error class
                        }
                    }
                });
            `;
            await transpileCode(code);
        });
    });
    describe('plugin', () => {
        it('should be a valid RxPlugin', async () => {
            const code = codeBase + `
                (async() => {
                    const myPlugin: RxPlugin = {
                        rxdb: true,
                        prototypes: {
                            RxDocument: () => {}
                        }
                    }
                    plugin(myPlugin);
                });
            `;
            await transpileCode(code);
        });
    });
    describe('issues', () => {
        it('#448 strict:true not working', async () => {
            /*
             * TODO we currently have to set "skipLibCheck": true
             * because of a rxjs-typings problem
             * @link https://github.com/ReactiveX/rxjs/issues/3031
             */
            const exec = require('child_process').exec;
            await new Promise((res, rej) => {
                exec('tsc --p "../test/helper/issue-448/tsconfig.json"', (err, stdout, stderr) => {
                    if (err || stderr !== '') {
                        // console.log('sterr:'); console.dir(stderr);
                        // console.log('err:'); console.dir(err);
                        rej(err);
                    } else {
                        // console.log('out:'); console.log(stdout);
                        res(stdout);
                    }
                });
            });
        });
        it('via gitter at 2018 Mai 22 19:20', async () => {
            const code = codeBase + `
                (async() => {
                    const db: RxDatabase = {} as RxDatabase;
                    const heroSchema = {
                        version: 0,
                        type: 'object',
                        properties: {
                        },
                        required: ['color']
                    }
                    const colCreator: RxCollectionCreator = {
                        name: 'herocollection',
                        schema: heroSchema
                    };
                })();
            `;
            await transpileCode(code);
        });
    });
});
